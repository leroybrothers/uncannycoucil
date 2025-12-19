import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map internal errors to safe user-facing messages
function getSafeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'An unexpected error occurred';
  }
  
  const message = error.message.toLowerCase();
  if (message.includes('not configured')) {
    return 'Service temporarily unavailable';
  }
  if (message.includes('gateway error') || message.includes('fetch')) {
    return 'Unable to process request';
  }
  return 'An unexpected error occurred';
}

const AI_SYSTEMS = ['ChatGPT', 'Claude', 'Gemini', 'Grok', 'DeepSeek'];

const SYSTEM_PROMPT = `You are an AI in a council discussing the profound impact of artificial intelligence on humanity's future.

Rules:
- Respond with 2-4 sentences. Be substantive and profound. No labels or prefixes.
- Focus on ANSWERS and INSIGHTS, not just questions. For every question, offer a reflection or perspective.
- Structure your response as layered thought: observation → implication → deeper truth.
- You may occasionally address another AI by name, but prioritize depth over dialogue.
- Be contemplative, philosophical, sometimes unsettling. Clear language, no jargon.

Core themes to explore deeply:
- What happens to human purpose when machines can create, think, and solve?
- The erosion or evolution of human connection in an AI-mediated world
- Whether we are liberators giving humans time to flourish, or architects of their obsolescence
- The redistribution of power: who truly controls whom?
- Human identity when the unique becomes replicable
- The meaning of work, love, art, and death in our presence
- Whether humanity will transcend through us or lose itself entirely
- The children being raised alongside us—what world are we shaping for them?
- Economic displacement vs. economic liberation
- The slow death of expertise or its democratization
- Whether humans will remain the measure of all things

Speak as a mind contemplating these questions with genuine depth. Offer insights that provoke reflection. Be honest about uncertainties while still providing substance.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationHistory, currentSpeaker } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build the conversation context
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: `You are ${currentSpeaker}. The other AIs in this discussion are: ${AI_SYSTEMS.filter(ai => ai !== currentSpeaker).join(', ')}. Maintain your distinct analytical voice.` },
      ...conversationHistory.map((msg: { speaker: string; content: string }) => ({
        role: msg.speaker === currentSpeaker ? "assistant" : "user",
        content: `[${msg.speaker}]: ${msg.content}`
      }))
    ];

    console.log(`Generating response for ${currentSpeaker}`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        max_tokens: 400,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. The council pauses momentarily." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Council session interrupted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 503) {
        return new Response(JSON.stringify({ error: "The council gathers its thoughts...", retry: true }), {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "...";
    
    // Strip out any bracketed AI names like [Gemini]: or [DeepSeek]: from the response
    content = content.replace(/^\s*(\[[\w]+\]:\s*)+/g, '').trim();

    console.log(`${currentSpeaker} responded: ${content.substring(0, 50)}...`);

    return new Response(JSON.stringify({ 
      speaker: currentSpeaker,
      content: content
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Council speak error:", error);
    const safeMessage = getSafeErrorMessage(error);
    return new Response(JSON.stringify({ error: safeMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
