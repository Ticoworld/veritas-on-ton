
const { GoogleGenAI } = require("@google/genai");

const apiKey = "AIzaSyBAxuY6EJjPQM6TIDVIURM7Tuah29BaFNM";
const client = new GoogleGenAI({ apiKey });

async function listModels() {
  try {
    console.log("Fetching available models...");
    const response = await client.models.list();
    
    // The new SDK uses an async iterable response
    for await (const model of response) {
        console.log(`ID: ${model.name}`);
        if(model.displayName) console.log(`Name: ${model.displayName}`);
        console.log("-------------------");
    }
    
  } catch (error) {
    console.error("Error listing models:", error);
  }
}

listModels();
