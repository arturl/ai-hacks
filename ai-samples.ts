import { OpenAI } from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
const readline = require('readline-sync');

const openai = new OpenAI();

export async function aiSamples() {
    //generateJoke();
    //useFunction();
    useWeatherJoke();
}
async function generateJoke(): Promise<void> {
    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: "You are an AI assistant that can tell jokes",
            },
            {
                role: "user",
                content: "Tell me a joke about software engineers",
            },
        ],
    });
    console.log(response.choices[0].message.content);
}

async function useFunction(): Promise<void> {

    const getWeatherFunction = {
        name: "GetWeather",
        description: "Get weather for a location",
        parameters: {
            type: "object",
            properties: {
                location: {
                    type: "string",
                    description: "Location to get the weather for",
                },
            },
            required: ["location"],
        },
    };

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            { role: "system", content: "You are an AI assistant that can invoke functions" },
            { role: "user", content: "What is weather in Seattle?" },
        ],
        functions: [getWeatherFunction],
    });
    const toolCall = response.choices[0].message;
    console.log(JSON.stringify(toolCall,null,2));
}

const getWeatherFunction = {
    name: "GetWeather",
    description: "Get weather for a location",
    parameters: {
        type: "object",
        properties: {
            location: {
                type: "string",
                description: "Location to get the weather for",
            },
        },
        required: ["location"],
    },
};

async function GetWeather(location: string): Promise<string> {
    return `Current weather in ${location}: rains all day`;
}

async function useWeatherJoke(): Promise<void> {

    const messages : ChatCompletionMessageParam[] = [
        { role: "system", content: "You are a helpful assistant. You can provide weather information, jokes about the weather, and have conversations." },
      ];

    const userMessage = "Tell me a joke about the current weather in Seattle"; // readline.question('You: ');
    messages.push({ role: 'user', content: userMessage });

    while (true) {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages,
            functions: [getWeatherFunction],
            function_call: "auto",
        });
        const message = response.choices[0].message;
        // Handle function invocation
        if (message.function_call) {
            const functionName = message.function_call.name;
            const functionArgs = JSON.parse(message.function_call.arguments);
    
            if (functionName === 'GetWeather') {
                const weather = await GetWeather(functionArgs.location);
                // Add the weather result as a message from the assistant
                messages.push({ role: 'function', name: 'GetWeather', content: weather });
                continue;
            }
        } 
        console.log(message.content);
        break;
    }
}