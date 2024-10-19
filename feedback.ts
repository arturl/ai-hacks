import { App, BlockAction } from "@slack/bolt";
import { StringIndexed } from "@slack/bolt/dist/types/helpers";

export function setupFeedbackHandlers(app: App<StringIndexed>) {
    app.action<BlockAction>("thumbs_up_action", async ({ body, ack, say }) => {
        await ack();

        const threadTs = body.message?.ts;
        await say({
            text: "Thank you for your feedback! 👍",
            thread_ts: threadTs,
        });
    });

    app.action<BlockAction>(
        "thumbs_down_action",
        async ({ body, ack, say }) => {
            await ack();

            const threadTs = body.message?.ts;
            await say({
                text: "Sorry to hear that! 👎",
                thread_ts: threadTs,
            });
        }
    );
}
