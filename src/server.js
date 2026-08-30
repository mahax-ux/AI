import "dotenv/config";
import express from "express";
import cors from "cors";
import { Groq } from "groq-sdk";
import Mem0 from "mem0ai"; 

const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

const groqApiKey = process.env.GROQ_API_KEY;
if (!groqApiKey) {
  console.error("Error: Missing GROQ_API_KEY in your .env file!");
  process.exit(1);
}

const groq = new Groq({ apiKey: groqApiKey });

// Initialize Mem0 Client
const memory = new Mem0({
  apiKey: process.env.MEM0_API_KEY, 
});

// API Endpoint for chatting with Mahax + Mem0 Integration
app.post("/api/chat", async (req, res) => {
  const { message, userId, messages } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  const currentUserId = userId || "guest";

  try {
    // 1. Hybrid Retrieval: Fetch baseline profile AND query-specific context
    let combinedMemories = [];
    try {
      const [allMemories, searchResults] = await Promise.all([
        memory.getAll({ filters: { user_id: currentUserId } }).catch(() => ({ results: [] })),
        memory.search(message, { filters: { user_id: currentUserId } }).catch(() => ({ results: [] }))
      ]);

      const allArray = Array.isArray(allMemories) ? allMemories : allMemories?.results || [];
      const searchArray = Array.isArray(searchResults) ? searchResults : searchResults?.results || [];

      // Deduplicate facts to keep the prompt clean
      const uniqueFacts = new Set([...allArray, ...searchArray].map(m => m.memory));
      combinedMemories = Array.from(uniqueFacts);
    } catch (memErr) {
      console.log("Memory retrieval skipped:", memErr.message);
    }

    // 2. Format chat history
    const chatMessages = messages && Array.isArray(messages) && messages.length > 0 
      ? messages.map(m => ({ role: m.role, content: m.content }))
      : [{ role: "user", content: message }];

    // 3. Conversational System Persona
    const memoryString = combinedMemories.length > 0 
      ? combinedMemories.map(f => `- ${f}`).join("\n") 
      : "No past context available yet.";

    const systemPrompt = `You are Mahax AI, an adaptive and conversational assistant built for Mahant. You are chatting with user: ${currentUserId}.
    
Your goal is to act like a true self-learning agent. Integrate the following facts about the user naturally into your conversation. Do not explicitly announce "I remember that you..." or "According to my memory...". Just use the context seamlessly to personalize your advice and tone.

User Profile & Memories:
${memoryString}`;

    // 4. Generate response via Groq
    const response = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b", 
      messages: [
        { role: "system", content: systemPrompt },
        ...chatMessages
      ],
      temperature: 0.7,
    });

    const agentReply = response.choices[0]?.message?.content || "I'm not sure how to respond.";

    // 5. Synchronous Memory Extraction
    await memory.add([
      { role: "user", content: message },
      { role: "assistant", content: agentReply }
    ], { user_id: currentUserId }).catch(err => console.error("Mem0 add error:", err));

    res.json({ reply: agentReply });

  } catch (err) {
    console.error("Groq/Mem0 API Error Details:", err?.message || err);
    res.status(500).json({ reply: `Error connecting to AI service: ${err?.message || "Unknown error"}` });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running locally at http://localhost:${PORT} with Hybrid Memory active.`);
});
