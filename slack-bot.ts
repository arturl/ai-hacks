import { App, BlockAction, GenericMessageEvent, View } from "@slack/bolt";
import * as dotenv from "dotenv";
import slackifyMarkdown from "slackify-markdown";
import {
    ensureToken,
    getPulumiAccessToken,
    getPulumiOrg,
    openTokenModal,
    setupTokenHandler,
} from "./state-management";
import { setupFeedbackHandlers } from "./feedback";

dotenv.config();

export const slackBotApp = new App({
    token: process.env.SLACK_BOT_TOKEN, // Slack Bot Token
    signingSecret: process.env.SLACK_SIGNING_SECRET, // Slack Signing Secret
});

interface Message {
    role: string;
    kind: string;
    content: string;
}

interface Plan {
    instructions: string;
    searchTerms: string[];
}

interface Program {
    code: string;
    language: string;
    plan: string;
}

interface ApiResponse {
    messages: Message[];
    programs: Program[];
}

// Listens to incoming messages in Slack
slackBotApp.message(async ({ message, say, context, client }) => {
    const botUserId = process.env.BOT_USER_ID;

    if ("text" in message && (message as GenericMessageEvent).text) {
        const messageEvent = message as GenericMessageEvent;
        const msgText = messageEvent.text;

        // If the bot is mentioned in the message, we need to respond.
        // If the message is in a thread that started by the message that mentioned the bot, we should also respond
        let needsResponse = false;
        let threadTs = "";
        if (msgText.includes(`<@${botUserId}>`)) {
            needsResponse = true;
            threadTs = "thread_ts" in message ? message.thread_ts : message.ts; // Use thread_ts if present, else use ts for new thread

            await client.chat.postMessage({
                channel: message.channel,
                text: `Hi <@${message.user}> :wave: Starting a new conversation.`,
                thread_ts: threadTs, // Respond in the same thread
            });
        } else if ("ts" in message && "thread_ts" in message) {
            // The message is part of a thread, let's fetch the root message
            const thisThreadTs = message.thread_ts;
            const response = await client.conversations.replies({
                channel: message.channel,
                ts: thisThreadTs,
                inclusive: true, // Include the original message that started the thread
                limit: 1, // Fetch only the root message
            });

            if (response.messages && response.messages.length > 0) {
                const rootMessage = response.messages[0];
                const rootMessageText = (
                    "text" in rootMessage ? rootMessage.text : ""
                ) as string;
                if (rootMessageText.includes(`<@${botUserId}>`)) {
                    needsResponse = true;
                    threadTs = message.thread_ts;
                }
            }
        }
        if (needsResponse) {
            // Remove the bot mention from the message text
            const cleanedMessage = message.text
                .replace(`<@${botUserId}>`, "")
                .trim();

            const pulumiToken = getPulumiAccessToken(
                messageEvent.team,
                messageEvent.channel
            );
            if (!pulumiToken) {
                await client.chat.postMessage({
                    channel: message.channel,
                    text: `Missing Pulumi Access Token. Please set your Pulumi Access Token using command \`/pulumi-access-token\`.`,
                    thread_ts: threadTs,
                });
                return;
            }

            const pulumiOrg = getPulumiOrg(
                messageEvent.team,
                messageEvent.channel
            );
            if (!pulumiOrg) {
                await client.chat.postMessage({
                    channel: message.channel,
                    text: `Missing Pulumi Organization. Please set your Pulumi Organization using command \`/pulumi-organization\`.`,
                    thread_ts: threadTs,
                });
                return;
            }

            let waitMessage = await client.chat.postMessage({
                channel: message.channel,
                text: `Hang in there while I'm processing your request...`,
                thread_ts: threadTs,
            });

            const myHeaders = new Headers();
            myHeaders.append("Authorization", `token ${pulumiToken}`);

            const requestOptions = {
                method: "GET",
                headers: myHeaders,
                redirect: "follow" as RequestRedirect,
            };

            try {
                const path = `https://app.pulumi.com/${pulumiOrg}`;
                const state = `{"client":{"cloudContext":{"url":{"path":"${path}"}}}}`;
                const response = await fetch(
                    `http://localhost:3002/cloud-ai/api/chat/v2?query=${cleanedMessage}&model=gpt-4o&state=${state}`,
                    requestOptions
                );
                const result: ApiResponse = await response.json();
                for (const message of result.messages) {
                    if (
                        message.role === "assistant" &&
                        message.kind !== "trace" &&
                        message.kind !== "status"
                    ) {
                        let slackMessageText = "";
                        try {
                            slackMessageText = slackifyMarkdown(
                                message.content
                            );
                        } catch (err) {
                            console.error(
                                { err },
                                "Failed to convert message to Slack markdown"
                            );
                        }

                        try {
                            const responseMsg = await client.chat.update({
                                channel: waitMessage.channel,
                                text: slackMessageText,
                                ts: waitMessage.ts,
                            });
                        } catch (err) {
                            console.error(
                                { err },
                                "Failed to send message to Slack"
                            );
                        }
                    }
                }

                if (result.programs)
                    for (const message of result.programs) {
                        if (message.code) {
                            try {
                                await client.chat.postMessage({
                                    channel: waitMessage.channel,
                                    blocks: [
                                        {
                                            type: "section",
                                            text: {
                                                type: "mrkdwn",
                                                text: `*${message.language}*`,
                                            },
                                        },
                                        {
                                            type: "divider",
                                        },
                                        {
                                            type: "section",
                                            text: {
                                                type: "mrkdwn",
                                                text:
                                                    "```" +
                                                    message.code +
                                                    "```",
                                            },
                                        },
                                    ],

                                    thread_ts: threadTs,
                                });
                            } catch (err) {
                                console.error(
                                    { err },
                                    "Failed to send code block to Slack"
                                );
                            }
                        }
                    }

                // Add feedback buttons
                await client.chat.postMessage({
                    channel: waitMessage.channel,
                    blocks: [
                        {
                            type: "divider",
                        },
                        {
                            type: "section",
                            text: {
                                type: "mrkdwn",
                                text: "Provide feedback:",
                            },
                        },
                        {
                            type: "actions",
                            elements: [
                                {
                                    type: "button",
                                    text: {
                                        type: "plain_text",
                                        text: "👍",
                                        emoji: true,
                                    },
                                    value: "thumbs_up",
                                    action_id: "thumbs_up_action",
                                },
                                {
                                    type: "button",
                                    text: {
                                        type: "plain_text",
                                        text: "👎",
                                        emoji: true,
                                    },
                                    value: "thumbs_down",
                                    action_id: "thumbs_down_action",
                                },
                            ],
                        },
                    ],
                    thread_ts: threadTs,
                });
            } catch (error) {
                console.error(error);
            }
        }
    } else {
        console.log(JSON.stringify(message));
    }
});

setupFeedbackHandlers(slackBotApp);
setupTokenHandler(slackBotApp);
