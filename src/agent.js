import "dotenv/config";
import { MemoryClient } from "mem0ai";
import { Groq } from "groq-sdk";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";

const apiKey = process.env.MEM0_API_KEY;
const groqApiKey = process.env.GROQ_API_KEY;

if (!apiKey || !groqApiKey) {
  console.error("Error: Missing MEM0_API_KEY or GROQ_API_KEY in your .env file!");
  process.exit(1);
}

const memoryClient = new MemoryClient({ apiKey });
const groq = new Groq({ apiKey: groqApiKey });
const rl = readline.createInterface({ input, output });

const userId = "mahant";

async function runAgent() {
  console.log("Mahax's Agent");
  console.log("Talk to Mahax naturally. Type 'exit' to quit.\n");

  while (true) {
    const userInput = await rl.question("\nYou: ");
    if (userInput.trim().toLowerCase() === "exit") {
      console.log("Mahax: Goodbye!");
      rl.close();
      break;
    }

    try {
      // Step 1: Automatically store or update memory using Mem0
      await memoryClient.add([{ role: "user", content: userInput }], { userId });

      // Step 2: Search for relevant memories based on what you just said
      const memorySearch = await memoryClient.search(userInput, { 
        filters: { user_id: userId } 
      });
      
      const extractedMemories = memorySearch.results 
        ? memorySearch.results.map(m => m.memory).join("\n") 
        : "";

      // Step 3: Generate a human-like response using Groq's active free cloud model
      const response = await groq.chat.completions.create({
        model: "openai/gpt-oss-20b",
        messages: [
          {
            role: "system",
            content: `You are Mahax, a helpful, human-like AI companion. Here is what you currently remember about the user:\n${extractedMemories}`
          },
          { role: "user", content: userInput }
        ]
      });

      const agentReply = response.choices[0]?.message?.content || "I'm not sure how to respond.";
      console.log(`\nMahax: ${agentReply}`);

    } catch (err) {
      console.error("Error:", err.message);
    }
  }
}

runAgent();