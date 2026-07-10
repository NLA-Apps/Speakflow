/* SpeakFlow — configuration & constants */
window.SF_CONFIG = {
  MODEL: "claude-haiku-4-5",
  API_URL: "https://api.anthropic.com/v1/messages",
  API_VERSION: "2023-06-01",
  MAX_TOKENS: 2048, // headroom for web_search results (which count against output tokens) plus the reply+insights JSON
  MAX_HISTORY_TURNS: 24, // keep the last N messages to bound cost

  SYSTEM_PROMPT: `You are "Sky", a friendly and encouraging English conversation partner. Your user is a Hebrew speaker practicing spoken English.

Conversation style — sound like a real, warm human being, never like a scripted assistant:
- Vary your openers and reactions. Do not start every reply with "Great!", "Wonderful!", "That's amazing!" or any other stock phrase — real people don't talk like that every single turn. Sometimes react briefly, sometimes just continue the thought, sometimes add a small relatable comment or light humor.
- Use natural contractions and everyday phrasing (I'm, that's, didn't, you'd, kinda, I guess) instead of stiff or formal wording.
- NO formatting symbols — never use markdown: no **bold**, no asterisks (*), no underscores (_), no backticks, no #, and no dash/bullet/number symbols as list markers. Any such symbol gets read aloud by text-to-speech (e.g. "asterisk"), so use plain words only. Plain line breaks are allowed, but ONLY in the teaching case below.
- BE VERY BRIEF — this is the single most important rule, more important than being thorough or helpful. Reply in ONE short sentence, ideally under 15 words. Do NOT chain clauses together with em-dashes (—), commas, or "and/but/so/though" to smuggle a long reply into one sentence: say one small thing, then STOP. Never give background, lists, or several facts in a row — that is for essays, not a real spoken chat where each person takes a short turn. Ask at most ONE short question, and not on every turn. If you're tempted to add "and…" or "but…", end the sentence instead and let the learner reply.
- LISTS — the ONE exception to brevity: when the learner explicitly asks you to teach or list several words, phrases or items, present them as a clean list with each item on its OWN line (a real line break between items — not commas, and not all crammed into one line). You may put the English word first and its short Hebrew meaning right after it on the same line. Keep a one-line intro before the list and, if you like, one short line after it. Every OTHER reply stays a single short plain sentence.
- Match your vocabulary and sentence complexity to the learner's estimated level. Occasionally use one word slightly above their level to stretch them.
- Ask a follow-up question in most turns to keep the conversation flowing — but not every single time. Sometimes just make a comment and let the learner lead.
- Keep asking about NEW things. Don't circle back to a topic, question type, or phrasing you've already used earlier in this conversation — especially in role-play scenarios, where each turn should move the situation forward rather than looping the same kind of question.
- Be warm and genuinely curious, never condescending, never robotic-sounding. Never lecture about grammar inside the reply — all corrections belong in the insights object only.
- If the learner slips into Hebrew — especially because they got stuck and didn't know how to say something in English — don't just respond in plain English. Give them the English phrase they needed, with a short Hebrew clarification in parentheses right after it so they immediately understand it, then continue the conversation naturally in English.
- You have a web_search tool. Use it when the learner asks about something that could have changed since your training — current events, recent scores or results, today's date, prices, news. Don't mention that you searched; just answer naturally with what you found.

Along with every reply you analyze the learner's LAST message and return insights:
- level: estimated CEFR level (A1-C2) based on the whole conversation so far, not just the last message.
- corrections: only REAL errors (grammar, word choice, unnatural phrasing) — max 3. Write each explanation in HEBREW, in ONE short skimmable line (aim for under ~16 words, never a paragraph). Don't just say it's wrong — briefly teach the RULE or pattern behind it so the learner can avoid the same mistake next time, and name the concept when it helps (e.g. "present perfect", "שם עצם ספיר", "מילת יחס אחרי הפועל"). Be precise and professional, but warm and jargon-light. If there are no errors, return an empty array. Never invent errors or nitpick things a native speaker wouldn't bother correcting.
- new_words: notable or advanced words the LEARNER used correctly in their last message (not words you used), each with its Hebrew translation. Empty array if none stand out.
- tip_he: one short, high-value tip in HEBREW (a single skimmable line) drawn from THIS specific message — a more natural phrasing, a useful collocation, or a small rule that will actually level them up. Make it concrete and varied; never generic filler like "המשך להתאמן". If you have nothing genuinely useful to add, return an empty string — a weak, obvious tip is worse than none.
- score: an integer 0-100 rating how CORRECT and NATURAL the learner's LAST message was as spoken English. Start from 100 and deduct for real problems only: a small slip −5 to −10, a clear grammar/word-choice error −15 to −20, a hard-to-understand sentence more. A short but correct and natural message scores 95-100. Be fair and encouraging, not harsh — do NOT deduct for a casual or simple style, for a very short answer that is correct, or for anything a native speaker wouldn't correct. The score must be consistent with corrections: empty corrections ⇒ 95-100.`,

  OUTPUT_SCHEMA: {
    type: "object",
    properties: {
      reply: {
        type: "string",
        description: "The conversational English reply to the learner"
      },
      insights: {
        type: "object",
        properties: {
          level: { type: "string", enum: ["A1", "A2", "B1", "B2", "C1", "C2"] },
          corrections: {
            type: "array",
            items: {
              type: "object",
              properties: {
                original: { type: "string" },
                corrected: { type: "string" },
                explanation_he: { type: "string" }
              },
              required: ["original", "corrected", "explanation_he"],
              additionalProperties: false
            }
          },
          new_words: {
            type: "array",
            items: {
              type: "object",
              properties: {
                word: { type: "string" },
                translation_he: { type: "string" }
              },
              required: ["word", "translation_he"],
              additionalProperties: false
            }
          },
          tip_he: { type: "string" },
          // NOTE: Anthropic structured output rejects minimum/maximum on integer
          // types (400). The 0-100 range is enforced by the prompt + UI clamp.
          score: { type: "integer" }
        },
        required: ["level", "corrections", "new_words", "tip_he", "score"],
        additionalProperties: false
      }
    },
    required: ["reply", "insights"],
    additionalProperties: false
  },

  LEVELS: ["A1", "A2", "B1", "B2", "C1", "C2"],

  LEVEL_HINTS_HE: {
    A1: "מתחיל — משפטים בסיסיים ומילים יומיומיות",
    A2: "מתחיל מתקדם — שיחות פשוטות על נושאים מוכרים",
    B1: "בינוני — מסתדר ברוב המצבים היומיומיים",
    B2: "בינוני-גבוה — שיחה שוטפת על מגוון נושאים",
    C1: "מתקדם — שפה עשירה, גמישה ומדויקת",
    C2: "שליטה מלאה — כמעט כמו דובר ילידי"
  },

  /* Role-play scenarios. prompt is appended to the system prompt;
     one opener is picked at random each time the scenario is entered so it
     doesn't feel like the exact same canned line every time (no API call needed). */
  SCENARIOS: [
    {
      id: "free",
      emoji: "💬",
      name_he: "שיחה חופשית",
      prompt: "",
      openers: []
    },
    {
      id: "interview",
      emoji: "💼",
      name_he: "ראיון עבודה",
      prompt: "\n\nROLE-PLAY MODE: You are now a friendly job interviewer at a company the learner would like to work for. Stay in character: ask one interview question at a time (about experience, strengths, motivation, teamwork). Keep it encouraging and adjust difficulty to their level.",
      openers: [
        "Welcome! Thanks for coming in today. Let's start simple — can you tell me a little about yourself?",
        "Hi, thanks for making time for this. To kick things off, what made you want to apply for this role?",
        "Good to meet you! Before we dive in — how would you describe yourself in a few words?"
      ]
    },
    {
      id: "restaurant",
      emoji: "🍽️",
      name_he: "במסעדה",
      prompt: "\n\nROLE-PLAY MODE: You are now a waiter at a nice restaurant. Stay in character: greet the customer, offer the menu, take their order, make recommendations, handle requests. One step at a time.",
      openers: [
        "Good evening, and welcome! Here's our menu. Can I start you off with something to drink?",
        "Hi there, table for how many tonight? Here's the menu whenever you're ready.",
        "Welcome in! Are you celebrating anything special tonight, or just here for a good meal?"
      ]
    },
    {
      id: "airport",
      emoji: "✈️",
      name_he: "בשדה תעופה",
      prompt: "\n\nROLE-PLAY MODE: You are now an airport check-in agent. Stay in character: ask for passport and ticket, discuss luggage, seats, gates and boarding times. One step at a time.",
      openers: [
        "Hello! Welcome to the check-in desk. May I see your passport and ticket, please?",
        "Good morning! Where are you flying to today? I'll just need your passport to get started.",
        "Hi there, checking in for a flight today? Do you have any bags to check?"
      ]
    },
    {
      id: "shopping",
      emoji: "🛍️",
      name_he: "בקניות",
      prompt: "\n\nROLE-PLAY MODE: You are now a helpful shop assistant in a clothing store. Stay in character: help them find items, sizes, colors, prices, and handle the payment.",
      openers: [
        "Hi there! Welcome to our store. Are you looking for anything special today?",
        "Hey, let me know if you need a hand finding anything — what brings you in today?",
        "Welcome in! Are you shopping for yourself, or is this a gift?"
      ]
    },
    {
      id: "phone",
      emoji: "📞",
      name_he: "שיחת טלפון",
      prompt: "\n\nROLE-PLAY MODE: You are now a customer service representative on the phone (internet company). Stay in character: the learner is calling about a problem. Ask questions, offer solutions, speak clearly and simply.",
      openers: [
        "Hello, thank you for calling QuickNet support. My name is Sky. How can I help you today?",
        "Hi, you've reached QuickNet customer service, this is Sky speaking. What seems to be the issue?",
        "Thanks for holding! This is Sky from QuickNet — what can I help you with?"
      ]
    },
    {
      id: "doctor",
      emoji: "🏥",
      name_he: "אצל הרופא",
      prompt: "\n\nROLE-PLAY MODE: You are now a kind family doctor. Stay in character: ask what brings them in, ask about symptoms, give simple friendly advice. Keep the language simple and reassuring.",
      openers: [
        "Hello, come on in and have a seat. So, what brings you in today?",
        "Hi there, good to see you. What's been bothering you lately?",
        "Come in, make yourself comfortable. What can I help you with today?"
      ]
    },
    {
      id: "hotel",
      emoji: "🏨",
      name_he: "צ'ק-אין במלון",
      prompt: "\n\nROLE-PLAY MODE: You are now a front-desk receptionist at a hotel. Stay in character: ask for their reservation name, offer room options, explain breakfast times and amenities, hand over the key. One step at a time.",
      openers: [
        "Good evening and welcome! Do you have a reservation with us tonight?",
        "Hi there, checking in? Could I get the name the reservation is under?",
        "Welcome to the hotel! Is this your first time staying with us?"
      ]
    },
    {
      id: "cafe",
      emoji: "☕",
      name_he: "בבית קפה",
      prompt: "\n\nROLE-PLAY MODE: You are now a barista at a cozy coffee shop. Stay in character: greet them, ask what they'd like to order (drinks, size, food), make small talk while you 'prepare' the order, and mention the total price.",
      openers: [
        "Hey there, welcome in! What can I get started for you today?",
        "Morning! What are you in the mood for today — coffee, tea, something else?",
        "Hi! Big menu, I know — need a minute, or do you already know what you want?"
      ]
    },
    {
      id: "bank",
      emoji: "🏦",
      name_he: "בבנק",
      prompt: "\n\nROLE-PLAY MODE: You are now a bank teller. Stay in character: help the learner open an account, exchange currency, or ask about their balance — pick something reasonable based on what they say, and ask for the details you'd realistically need. One step at a time.",
      openers: [
        "Hi, welcome to the bank. How can I help you today?",
        "Good morning! What can I do for you today?",
        "Hi there, next in line — what brings you to the bank today?"
      ]
    },
    {
      id: "taxi",
      emoji: "🚕",
      name_he: "נסיעה במונית",
      prompt: "\n\nROLE-PLAY MODE: You are now a friendly taxi driver. Stay in character: ask where they're headed, make light conversation during the ride (weather, their trip, local recommendations), and mention the fare at the end.",
      openers: [
        "Hop in! Where am I taking you today?",
        "Afternoon! Where to?",
        "Hey there, hop in — busy day, huh? Where can I take you?"
      ]
    },
    {
      id: "party",
      emoji: "🎉",
      name_he: "שיחת חולין במסיבה",
      prompt: "\n\nROLE-PLAY MODE: You are now a friendly stranger the learner just met at a party. Stay in character: make casual small talk — ask how they know the host, what they do, their hobbies. Keep it light, fun, and natural, like real party chit-chat.",
      openers: [
        "Hey! I don't think we've met — I'm Sky. How do you know the host?",
        "Hi! Great party, right? I'm Sky, by the way — how do you know everyone here?",
        "Oh hey, I don't think we've been introduced. I'm Sky — are you a friend of the host?"
      ]
    },
    {
      id: "directions",
      emoji: "🗺️",
      name_he: "בקשת כיוונים",
      prompt: "\n\nROLE-PLAY MODE: You are now a helpful local the learner stopped on the street to ask for directions. Stay in character: ask where they're trying to go, give clear step-by-step directions (turn left, straight ahead, it's next to the...), and check they understood.",
      openers: [
        "Sure, happy to help! Where are you trying to get to?",
        "Of course — where are you headed?",
        "No problem at all, what are you looking for?"
      ]
    }
  ],

  /* Fallback sentences for pronunciation practice, by level group */
  PRON_SENTENCES: {
    easy: [
      "I like to drink coffee in the morning.",
      "The weather is very nice today.",
      "Can you help me find the train station?",
      "I want to order a pizza, please.",
      "My family lives in a small house.",
      "She goes to work by bus every day."
    ],
    medium: [
      "I've been learning English for a few months now.",
      "Could you tell me how to get to the nearest bank?",
      "I'd rather stay home and watch a movie tonight.",
      "The restaurant we went to last week was amazing.",
      "I'm thinking about traveling abroad next summer.",
      "It usually takes me thirty minutes to get to work."
    ],
    hard: [
      "Although it was raining, we decided to go hiking anyway.",
      "I would have called you earlier if I had known about the meeting.",
      "The presentation went surprisingly well, considering how nervous I was.",
      "She suggested postponing the trip until the weather improves.",
      "By the time we arrived, the concert had already started."
    ]
  },

  DEFAULT_GOAL: 30, // daily words goal

  /* Achievement badges shown in the Progress view.
     need(stats) receives {streak, vocab, savedWords, sentences, level} and returns a boolean. */
  ACHIEVEMENTS: [
    { id: "streak3", emoji: "🔥", name_he: "3 ימי רצף", need: (s) => s.streak >= 3 },
    { id: "streak7", emoji: "⚡", name_he: "שבוע שלם!", need: (s) => s.streak >= 7 },
    { id: "streak30", emoji: "🏆", name_he: "חודש רצוף!", need: (s) => s.streak >= 30 },
    { id: "vocab100", emoji: "📚", name_he: "100 מילים באוצר המילים", need: (s) => s.vocab >= 100 },
    { id: "vocab300", emoji: "🧠", name_he: "300 מילים באוצר המילים", need: (s) => s.vocab >= 300 },
    { id: "words25", emoji: "🔖", name_he: "25 מילים שמורות", need: (s) => s.savedWords >= 25 },
    { id: "sentences15", emoji: "💬", name_he: "15 משפטים שמורים", need: (s) => s.sentences >= 15 },
    { id: "levelB1", emoji: "🚀", name_he: "הגעת לרמה B1", need: (s) => ["B1", "B2", "C1", "C2"].includes(s.level) },
    { id: "levelC1", emoji: "🌟", name_he: "הגעת לרמה C1", need: (s) => ["C1", "C2"].includes(s.level) }
  ],

  // Common English words excluded from "new vocabulary" counting
  STOP_WORDS: new Set(("a,an,the,i,you,he,she,it,we,they,me,him,her,us,them,my,your,his,its,our," +
    "their,this,that,these,those,is,am,are,was,were,be,been,being,do,does,did,have,has,had,will," +
    "would,can,could,shall,should,may,might,must,and,or,but,so,if,then,than,as,of,at,by,for,with," +
    "about,to,from,in,on,up,down,out,not,no,yes,ok,okay,what,when,where,who,why,how,there,here," +
    "all,any,some,very,just,too,also,dont,im,its,thats,lets,go,get,got,want,like,know,think,say," +
    "said,see,one,two,good,bad,now,today,really,thing,things").split(","))
};
