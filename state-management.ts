import { App, View } from "@slack/bolt";
import { StringIndexed } from "@slack/bolt/dist/types/helpers";

interface Context {
    token: string;
    org: string;
}

interface ContextStore {
    [key: string]: Context; // key: combination of team and channel, value: token and org
}

// In the real implementation, this would be stored in a database or Redis
const tokenStore: ContextStore = {};

function makeKey(team: string, channel: string): string {
    return `${team}:${channel}`;
}

function storePulumiAccessToken(
    team: string,
    channel: string,
    token: string
): void {
    const key = makeKey(team, channel);
    if (tokenStore[key]) {
        tokenStore[key].token = token;
    } else {
        tokenStore[key] = {
            token,
            org: "",
        };
    }
}

function storeOrg(team: string, channel: string, org: string): void {
    const key = makeKey(team, channel);
    if (tokenStore[key]) {
        tokenStore[key].org = org;
    } else {
        tokenStore[key] = {
            token: "",
            org,
        };
    }
}

export function getPulumiAccessToken(
    team: string,
    channel: string
): string | undefined {
    // Check the environment variable first
    if (process.env.PULUMI_ACCESS_TOKEN) {
        return process.env.PULUMI_ACCESS_TOKEN;
    }
    const key = makeKey(team, channel);
    return tokenStore[key].token;
}

export function getPulumiOrg(
    team: string,
    channel: string
): string | undefined {
    // Check the environment variable first
    if (process.env.PULUMI_ORG) {
        return process.env.PULUMI_ORG;
    }
    const key = makeKey(team, channel);
    return tokenStore[key].org;
}

export async function ensureToken(
    app: App<StringIndexed>,
    team: string,
    channel: string,
    threadTs: string
) {
    if (!getPulumiAccessToken(team, channel)) {
        await app.client.chat.postMessage({
            channel,
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "Please set your Pulumi Access Token to continue:",
                    },
                },
                {
                    type: "actions",
                    elements: [
                        {
                            type: "button",
                            text: {
                                type: "plain_text",
                                text: "Enter Pulumi Access Token",
                            },
                            action_id: "provide_token_action",
                        },
                    ],
                },
            ],
            thread_ts: threadTs,
        });
    }
}

// Function to open a modal for token input
export async function openTokenModal(
    app: App<StringIndexed>,
    triggerId: string,
    team: string,
    channel: string
) {
    const modal: View = {
        type: "modal",
        callback_id: "token_modal",
        title: {
            type: "plain_text",
            text: "Pulumi Access Token",
        },
        blocks: [
            {
                type: "input",
                block_id: "token_input",
                label: {
                    type: "plain_text",
                    text: "Enter your Pulumi Access Token:",
                },
                element: {
                    type: "plain_text_input",
                    action_id: "token_value",
                    multiline: false,
                },
            },
        ],
        submit: {
            type: "plain_text",
            text: "Submit",
        },
        private_metadata: JSON.stringify({ team, channel }),
    };

    await app.client.views.open({
        token: process.env.SLACK_BOT_TOKEN,
        trigger_id: triggerId,
        view: modal,
    });
}

export function setupTokenHandler(app: App<StringIndexed>) {
    app.view("token_modal", async ({ ack, view, body }) => {
        await ack();

        const token = view.state.values.token_input.token_value.value;
        const privateMetadata = JSON.parse(view.private_metadata);
        const team = privateMetadata.team;
        const channel = privateMetadata.channel;

        storePulumiAccessToken(team, channel, token);

        await app.client.chat.postMessage({
            channel,
            text: `Thank you! The token has been set. To reset it, use the command \`/pulumi-access-token\`.`,
        });
    });

    app.action("provide_token_action", async ({ ack, body, say }) => {
        await ack();

        const triggerId = "trigger_id" in body ? body.trigger_id : "";

        const team = body.team.id;
        const channel = body.channel.id;

        await openTokenModal(app, triggerId, team, channel);
    });

    app.command("/pulumi-access-token", async ({ ack, body }) => {
        await ack();

        const triggerId = "trigger_id" in body ? body.trigger_id : "";

        const team = body.team_id;
        const channel = body.channel_id;

        await openTokenModal(app, triggerId, team, channel);
    });

    app.command("/pulumi-organization", async ({ command, ack, respond }) => {
        await ack();

        const tokenArgument = command.text.trim();
        storeOrg(command.team_id, command.channel_id, tokenArgument);

        await app.client.chat.postMessage({
            channel: command.channel_id,
            text: `The organization has been set to *${tokenArgument}*.`,
        });
    });
}
