import { GoogleGenerativeAI } from "@google/generative-ai";
import { Billboard, Client } from "../types";

// Safe access to API Key for browser environments
const getApiKey = () => {
  try {
    // Check if process exists (Node/Polyfill) and has env
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
      return process.env.API_KEY;
    }
  } catch (e) {
    // Ignore error if process is not defined
  }
  return '';
};

const apiKey = getApiKey();
const ai = apiKey ? new GoogleGenerativeAI({ apiKey }) : null;

export const generateBillboardDescription = async (billboard: Billboard): Promise<string> => {
  if (!ai) return `Premium billboard located at ${billboard.location} in ${billboard.town}. High visibility and traffic area.`;

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const response = await model.generateContent(`Write a catchy, premium 2-sentence marketing description for a billboard located at ${billboard.location} in ${billboard.town}. The billboard type is ${billboard.type}. Highlight visibility and traffic.`);
    return response.response.text() || "High visibility location perfect for your brand.";
  } catch (e) {
    console.warn("AI Generation failed:", e);
    return "Premium advertising space available in high-traffic area.";
  }
};

export const generateRentalProposal = async (client: Client, billboard: Billboard, cost: number): Promise<string> => {
  if (!ai) return `Dear ${client.contactPerson},\n\nWe are pleased to offer you a space at ${billboard.location}. The monthly rate is $${cost}.\n\nBest regards,\nBlack Ivy Media`;

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const response = await model.generateContent(`Draft a professional, persuasive email proposal to ${client.contactPerson} from ${client.companyName} for renting a billboard at ${billboard.location} (${billboard.town}). 
        The monthly rate is $${cost}. 
        Focus on value, visibility, and partnership. Keep it under 100 words.`);
    return response.response.text() || "Proposal generation failed.";
  } catch (e) {
    console.warn("AI Proposal failed:", e);
    return "Error generating proposal. Please try again later.";
  }
};

export const analyzeBusinessData = async (dataContext: string): Promise<string> => {
    if (!ai) return "AI Analysis unavailable. Please check your API Key configuration.";

    try {
        const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const response = await model.generateContent(`You are Black Ivy AI, a highly intelligent business analyst for a Billboard Advertising company. 
            Analyze the provided data context and answer the user's specific question. 
            If the user asks for a summary, provide a concise strategic overview.
            If the user asks a specific question (e.g., "How is Harare doing?"), use the data to answer specifically.
            Keep the tone professional, encouraging, and data-driven. Keep the answer under 50 words unless asked for more detail.
            
            Data Context: ${dataContext}`);
        return response.response.text() || "I couldn't analyze the data at this moment.";
    } catch (e) {
        return "Could not generate insights due to network or API limits.";
    }
};

export const estimateLocationDetails = async (location: string, town: string): Promise<{ lat: number, lng: number, visibility: string }> => {
    if (!ai) {
        // Mock fallback if no API key
        return {
            lat: -17.8292,
            lng: 31.0522,
            visibility: "Simulated: High visibility area with significant daily traffic volume along main arterial routes."
        };
    }

    try {
        const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const response = await model.generateContent({
            contents: [{
                parts: [{
                    text: `Provide estimated latitude and longitude coordinates for a billboard located at "${location}" in "${town}, Zimbabwe". 
            Also provide a short, professional 2-sentence assessment of the billboard's visibility and traffic potential based on this location.
            Return the result as a JSON object with keys: lat, lng, and visibility.`
                }]
            }]
        });
        
        const text = response.response.text();
        if (text) {
            // Extract JSON from response text
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        }
        throw new Error("No response text");
    } catch (e) {
        console.error("AI Location Estimate failed", e);
        return {
            lat: -17.82, 
            lng: 31.05, 
            visibility: "Could not generate analysis via AI. Defaulting to general Harare coordinates."
        };
    }
};