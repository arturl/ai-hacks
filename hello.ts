import { OpenAI } from "openai";
import { apiSystemPrompt } from "./apiSystemPrompt";
import { measureExecutionTime } from "./measureTime";
import { apiCallBuilderSystemPrompt } from "./apiCallBuilderSystemPrompt";

const openai = new OpenAI();

type CompletionTool = {
    function: any;
    name: string;
    systemPrompt: string;
}

async function callRESTAPI(url: string) {
    return `Call to ${url} returned some data`;
}

type APICallerToolArguments = {
    url: string;
}

const apiCallerTool = {
    name: "APICaller",
    description: "Call a REST API",
    parameters: {
        type: "object",
        properties: {
            url: {
                type: "string",
                description: "The Url of the call",
            },
        },
        required: ["url"],
    },
}

type ApiCallBuilderToolArguments = {
    function: string
    organization: string
    project: string
    stack: string
    updateID: string
}

const apiCallBuilderTool = {
    name: "APICallBuilder",
    description: "Call a function that knowns how to call REST APIs",
    parameters: {
        type: "object",
        properties: {
            function: {
                type: "string",
                description: "The name of the function to call",
            },
            organization: {
                type: "string",
                description: "The name of the user's organization",
            },
            project: {
                type: "string",
                description: "The name of the project in the organization",
            },
            stack: {
                type: "string",
                description: "The name of the stack in the project",
            },
            updateID: {
                type: "string",
                description: "The ID of the update, used for summaries",
            },
        },
        required: ["function", "organization", "project", "stack"],
    },
}

// This function builds a API call. For now it's only the URL but can be expanded to include headers, body, etc.
function buildAPICall(args: ApiCallBuilderToolArguments) : string {
    //
    // LLM determined which function to call and gave us all the arguments it could figure out from the context
    // This gives an opportunity to inspect the arguments, fix them up if necessary (maybe augmenting them based
    // on some other context that LLM did not have), and then form the Url if we're confident in the arguments.
    // If the arguments are not sufficient, we can tell the user that we cannot make the call and ask for more information
    // Or just return an error, which is better than making a call with bad arguments
    //
    // We can also call other functions to validate the arguments
    //
    let url = "";
    switch (args.function) {
        case "Get Stacks":
            // This is an example of imperative logic to build the URL depending on whether the project is provided
            if(args.project !== ""){
                url = `https://api.bomboluni.com/api/user/stacks?organization=${args.organization}&project=${args.project}`;
            }
            else {
                url = `https://api.bomboluni.com/api/user/stacks?organization=${args.organization}`;
            }
            break;
        case "Get Update or Preview Summary and Diagnostics":
            url = `https://api.bomboluni.com/api/console/stacks/${args.organization}/${args.project}/${args.stack}/updates/${args.updateID}/summary`;
            break;
        default:
            // throw an exception:
            throw Error(`ERROR: Unknown function '${args.function}'`);
    }
    return url;
}

async function chat(tool: CompletionTool, userContext:string, userQuery: string) : Promise<void>{
    const response = await measureExecutionTime(chatImpl, tool, userContext, userQuery);
    console.log(response.result);
    console.log(`Execution time: ${response.executionTime}ms`);
}

async function measureChatTime(tool: CompletionTool, userContext:string, userQuery: string) : Promise<number>{
    const response = await measureExecutionTime(chatImpl, tool, userContext, userQuery);
    return response.executionTime;
}

async function chatImpl(tool: CompletionTool, userContext:string, userQuery: string): Promise<string>{

    // while (true) // emulate outer loop
    {
        const response = await openai.chat.completions
            .create({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: tool.systemPrompt },
                    { role: "user", content: userContext + "\n" + userQuery },
                ],
                functions: [tool.function],
                function_call: { name: tool.name}
            });

        const toolCall = response.choices[0].message;

        if (toolCall.function_call) {
            let url = "";
            if(toolCall.function_call.name === "APICallBuilder"){
                const args : ApiCallBuilderToolArguments = JSON.parse(toolCall.function_call.arguments) as ApiCallBuilderToolArguments;
                url = await buildAPICall(args);
            }
            else if(toolCall.function_call.name === "APICaller"){
                const args : APICallerToolArguments = JSON.parse(toolCall.function_call.arguments) as APICallerToolArguments;
                url = args.url;
            }
            if(url){
                const data = await callRESTAPI(url);
                return data;
            }
            else {
                return "ERROR: Could not make the API call";
            }
        }
    }

    return "error";
}

async function main() {
    const completionToolForAPICall = { function: apiCallerTool, name: "APICaller", systemPrompt: apiSystemPrompt };
    const completionToolForCallBuilder = { function: apiCallBuilderTool, name: "APICallBuilder", systemPrompt: apiCallBuilderSystemPrompt };

    const userContext1 = "The user's organization is 'Contoso' and the project is 'Acme'";
    const query1 = "What stacks do we have in the organization?";
    
    const userContext2 = "The user's organization is 'Contoso' and the project is 'Acme'. The stack is called 'dev'";
    const query2 = "Summarize update 7 for the stack";

    console.log("--> Making API calls by letting the LLM generate the API call");

    await chat(completionToolForAPICall, userContext1, query1);
    await chat(completionToolForAPICall, userContext2, query2);

    console.log("--> Making API calls through a proxy tool");

    await chat(completionToolForCallBuilder, userContext1, query1);
    await chat(completionToolForCallBuilder, userContext2, query2);

    // Error:
    await chat(completionToolForCallBuilder, userContext1, "Who is Donald Trump?");

    // Perf test: measure the time it takes to chat with the API call tool vs the caller (proxy) tool
/*    
    for (let index = 0; index < 20; index++) {
        const before = await measureChatTime(completionToolForAPICall, userContext2, query2);
        const after = await measureChatTime(completionToolForCaller, userContext2, query2);
        console.log(`${before}, ${after}`);
    }
*/
    console.log("done");
}

// Immediately invoke the async function
main().catch(console.error);
      