import type { DayKey, NewsLevel, Phrase, SrsRecord, WordPos, WordSeed } from "@/types";
import { todayKey } from "./date";
import { isDue } from "./srs";

/**
 * The daily-word curriculum and the rules for drawing a day's set
 * (docs/DAILY_WORDS.md).
 *
 * Two research findings shape this file more than any other:
 *
 *   1. WHICH words matter. A couple of thousand high-frequency words cover the
 *      overwhelming majority of everyday English (the General Service List
 *      tradition; NGSL ≈ 2,800 words ≈ 92% coverage). So the curriculum is a
 *      hand-curated, frequency-first spine of words a learner will actually
 *      need to PRODUCE — not rare words that only impress.
 *   2. HOW they're grouped. Words taught in a semantic set (synonyms, opposites,
 *      "five kinds of weather") interfere with each other and are learned more
 *      slowly (Tinkham 1993; Finkbeiner & Nicol 2003; Erten & Tekin 2008). So
 *      every seed carries a `field`, and a day's set never repeats one.
 *
 * Order within a band is roughly frequency/usefulness order: earlier words are
 * met first. The list is the offline spine — it needs no network and no AI.
 */

/** Daily doses offered in Settings. Small enough to always finish. */
export const WORDS_PER_DAY_OPTIONS = [3, 5, 8];

/** Ceiling on a whole session (new words + reviews) so a day never sprawls. */
export const MAX_SESSION_ITEMS = 10;

export const WORD_SEEDS: WordSeed[] = [
  // --- A2 — the everyday core -----------------------------------------------
  { id: "w-decide", word: "decide", pos: "verb", band: "A2", field: "choice",
    meaning: "choose what you are going to do",
    example: "We decided to stay home and cook instead.",
    collocations: ["decide to", "hard to decide", "decide on a date"] },
  { id: "w-worry", word: "worry", pos: "verb", band: "A2", field: "feelings",
    meaning: "keep thinking that something bad might happen",
    example: "Don't worry about the test — you've done the work.",
    collocations: ["worry about", "nothing to worry about"] },
  { id: "w-borrow", word: "borrow", pos: "verb", band: "A2", field: "money",
    meaning: "take something for a while and give it back later",
    example: "Can I borrow your charger until lunch?",
    collocations: ["borrow money", "borrow it from someone"] },
  { id: "w-explain", word: "explain", pos: "verb", band: "A2", field: "telling",
    meaning: "make something clear so another person understands it",
    example: "She explained the rules again, slowly.",
    collocations: ["explain why", "let me explain", "explain it to me"] },
  { id: "w-tired", word: "tired", pos: "adjective", band: "A2", field: "energy",
    meaning: "needing rest or sleep",
    example: "I was too tired to cook, so we ordered in.",
    collocations: ["tired of", "get tired", "look tired"] },
  { id: "w-busy", word: "busy", pos: "adjective", band: "A2", field: "time",
    meaning: "having a lot to do",
    example: "Mornings are busy, but I'm free after four.",
    collocations: ["busy with", "a busy week", "too busy to"] },
  { id: "w-forget", word: "forget", pos: "verb", band: "A2", field: "memory",
    meaning: "stop having something in your mind",
    example: "I always forget his name at the worst moment.",
    collocations: ["forget about", "forget to do something"] },
  { id: "w-invite", word: "invite", pos: "verb", band: "A2", field: "people",
    meaning: "ask someone to come somewhere or join something",
    example: "They invited us over for dinner on Sunday.",
    collocations: ["invite someone to", "invite them over"] },
  { id: "w-promise", word: "promise", pos: "verb", band: "A2", field: "trust",
    meaning: "say you will definitely do something",
    example: "I promise I'll call you when I land.",
    collocations: ["promise to", "keep a promise", "break a promise"] },
  { id: "w-share", word: "share", pos: "verb", band: "A2", field: "giving",
    meaning: "let someone else have or use part of what you have",
    example: "We shared a taxi to save money.",
    collocations: ["share with", "share a room", "share your thoughts"] },
  { id: "w-healthy", word: "healthy", pos: "adjective", band: "A2", field: "health",
    meaning: "good for your body, or in good condition",
    example: "Cooking at home is cheaper and healthier.",
    collocations: ["stay healthy", "a healthy diet"] },
  { id: "w-ready", word: "ready", pos: "adjective", band: "A2", field: "plans",
    meaning: "prepared, so you can start now",
    example: "Give me five minutes and I'll be ready.",
    collocations: ["ready for", "ready to go", "get ready"] },
  { id: "w-lucky", word: "lucky", pos: "adjective", band: "A2", field: "chance",
    meaning: "having good things happen to you by chance",
    example: "We were lucky with the weather all week.",
    collocations: ["lucky to", "get lucky", "a lucky guess"] },
  { id: "w-improve", word: "improve", pos: "verb", band: "A2", field: "learning",
    meaning: "get better, or make something better",
    example: "My listening improved once I stopped using subtitles.",
    collocations: ["improve quickly", "improve your English"] },
  { id: "w-save", word: "save", pos: "verb", band: "A2", field: "money",
    meaning: "keep money or time instead of using it",
    example: "We're saving for a trip in the spring.",
    collocations: ["save money", "save time", "save up for"] },
  { id: "w-quiet", word: "quiet", pos: "adjective", band: "A2", field: "sound",
    meaning: "with little or no noise",
    example: "I look for a quiet corner when I want to read.",
    collocations: ["a quiet street", "keep quiet", "go quiet"] },
  { id: "w-move", word: "move", pos: "verb", band: "A2", field: "home",
    meaning: "go to a different place, or change where something is",
    example: "They moved to a smaller flat closer to work.",
    collocations: ["move to", "move house", "move it over"] },
  { id: "w-fair", word: "fair", pos: "adjective", band: "A2", field: "fairness",
    meaning: "treating everyone in the right, equal way",
    example: "That's not fair — she did most of the work.",
    collocations: ["a fair price", "fair enough", "it's only fair"] },
  { id: "w-notice", word: "notice", pos: "verb", band: "A2", field: "attention",
    meaning: "see or realize something, often suddenly",
    example: "I didn't notice the sign until we'd passed it.",
    collocations: ["notice that", "hardly notice", "barely noticed"] },
  { id: "w-choice", word: "choice", pos: "noun", band: "A2", field: "options",
    meaning: "the chance to pick, or the thing you pick",
    example: "You've got a choice: leave early or take the late train.",
    collocations: ["make a choice", "no choice but to", "a good choice"] },

  // --- B1 — the productive middle -------------------------------------------
  { id: "w-afford", word: "afford", pos: "verb", band: "B1", field: "money",
    meaning: "have enough money or time for something",
    example: "We can't afford a bigger place this year.",
    collocations: ["can't afford to", "afford it"] },
  { id: "w-avoid", word: "avoid", pos: "verb", band: "B1", field: "risk",
    meaning: "stay away from something, or stop it from happening",
    example: "I leave at seven to avoid the traffic.",
    collocations: ["avoid doing something", "hard to avoid"] },
  { id: "w-suggest", word: "suggest", pos: "verb", band: "B1", field: "telling",
    meaning: "put forward an idea for someone to consider",
    example: "She suggested meeting halfway, which worked for both of us.",
    collocations: ["suggest that", "suggest an idea", "as I suggested"] },
  { id: "w-realize", word: "realize", pos: "verb", band: "B1", field: "understanding",
    meaning: "suddenly understand or become aware of something",
    example: "Halfway there I realized I'd left my laptop at home.",
    collocations: ["realize that", "didn't realize", "slowly realize"] },
  { id: "w-expect", word: "expect", pos: "verb", band: "B1", field: "expectation",
    meaning: "think that something will probably happen",
    example: "I didn't expect the room to be that small.",
    collocations: ["expect to", "as expected", "expect too much"] },
  { id: "w-manage", word: "manage", pos: "verb", band: "B1", field: "ability",
    meaning: "succeed in doing something difficult",
    example: "Somehow we managed to finish before the deadline.",
    collocations: ["manage to", "manage without", "manage your time"] },
  { id: "w-effort", word: "effort", pos: "noun", band: "B1", field: "work",
    meaning: "the energy you put into doing something",
    example: "It took a lot of effort, but the result was worth it.",
    collocations: ["make an effort", "worth the effort", "a real effort"] },
  { id: "w-advice", word: "advice", pos: "noun", band: "B1", field: "help",
    meaning: "an opinion about what someone should do",
    example: "The best advice I got was to start smaller.",
    collocations: ["give advice", "take someone's advice", "a piece of advice"] },
  { id: "w-complain", word: "complain", pos: "verb", band: "B1", field: "dissatisfaction",
    meaning: "say that you are unhappy about something",
    example: "He complained about the noise every single week.",
    collocations: ["complain about", "nothing to complain about"] },
  { id: "w-admit", word: "admit", pos: "verb", band: "B1", field: "honesty",
    meaning: "agree that something is true, especially unwillingly",
    example: "I'll admit I was wrong about that film.",
    collocations: ["admit that", "admit a mistake", "have to admit"] },
  { id: "w-deserve", word: "deserve", pos: "verb", band: "B1", field: "fairness",
    meaning: "have earned something, good or bad",
    example: "After that week, she deserved a proper rest.",
    collocations: ["deserve better", "deserve a break", "richly deserved"] },
  { id: "w-encourage", word: "encourage", pos: "verb", band: "B1", field: "support",
    meaning: "give someone confidence to do something",
    example: "My manager encouraged me to apply for it.",
    collocations: ["encourage someone to", "encouraged by"] },
  { id: "w-opportunity", word: "opportunity", pos: "noun", band: "B1", field: "chances",
    meaning: "a good moment or chance to do something",
    example: "Moving teams gave me the opportunity to learn the whole system.",
    collocations: ["take the opportunity", "miss an opportunity", "a rare opportunity"] },
  { id: "w-pressure", word: "pressure", pos: "noun", band: "B1", field: "stress",
    meaning: "the feeling of having to do something, or urgent demands",
    example: "There's a lot of pressure to answer messages instantly.",
    collocations: ["under pressure", "put pressure on", "pressure to do something"] },
  { id: "w-handle", word: "handle", pos: "verb", band: "B1", field: "problems",
    meaning: "deal with something difficult successfully",
    example: "She handled the complaint better than anyone expected.",
    collocations: ["handle it", "handle pressure", "hard to handle"] },
  { id: "w-focus", word: "focus", pos: "verb", band: "B1", field: "attention",
    meaning: "give all your attention to one thing",
    example: "I focus better in the morning, before the messages start.",
    collocations: ["focus on", "lose focus", "stay focused"] },
  { id: "w-prefer", word: "prefer", pos: "verb", band: "B1", field: "preference",
    meaning: "like one thing more than another",
    example: "I'd prefer to walk if we have time.",
    collocations: ["prefer to", "prefer X to Y", "would prefer"] },
  { id: "w-refuse", word: "refuse", pos: "verb", band: "B1", field: "refusal",
    meaning: "say firmly that you will not do something",
    example: "He refused to change the price, so we walked away.",
    collocations: ["refuse to", "flatly refuse"] },
  { id: "w-honest", word: "honest", pos: "adjective", band: "B1", field: "character",
    meaning: "telling the truth, even when it's awkward",
    example: "To be honest, I'd rather stay in tonight.",
    collocations: ["to be honest", "an honest answer", "honest with you"] },
  { id: "w-confident", word: "confident", pos: "adjective", band: "B1", field: "self",
    meaning: "sure about yourself or about something happening",
    example: "I'm getting more confident speaking on calls.",
    collocations: ["confident about", "quietly confident", "sound confident"] },
  { id: "w-afraid", word: "afraid", pos: "adjective", band: "B1", field: "fear",
    meaning: "frightened, or sorry to have to say something",
    example: "I'm afraid I can't make Thursday.",
    collocations: ["afraid of", "afraid to", "I'm afraid so"] },
  { id: "w-serious", word: "serious", pos: "adjective", band: "B1", field: "seriousness",
    meaning: "important and needing attention, or not joking",
    example: "It looked minor, but it turned into a serious problem.",
    collocations: ["a serious problem", "take it seriously", "are you serious"] },
  { id: "w-responsible", word: "responsible", pos: "adjective", band: "B1", field: "duty",
    meaning: "having the job of dealing with something, or being the cause",
    example: "I'm responsible for the schedule, so ask me first.",
    collocations: ["responsible for", "hold someone responsible"] },
  { id: "w-worth", word: "worth", pos: "adjective", band: "B1", field: "value",
    meaning: "good enough to justify the money, time, or trouble",
    example: "The queue was long, but the view was worth it.",
    collocations: ["worth it", "worth doing", "well worth"] },
  { id: "w-issue", word: "issue", pos: "noun", band: "B1", field: "problems",
    meaning: "a problem, or a subject people argue about",
    example: "We hit one small issue with the booking.",
    collocations: ["raise an issue", "a minor issue", "the real issue"] },
  { id: "w-goal", word: "goal", pos: "noun", band: "B1", field: "plans",
    meaning: "something you are trying to achieve",
    example: "My goal this month is to write every morning.",
    collocations: ["set a goal", "reach a goal", "a realistic goal"] },
  { id: "w-experience", word: "experience", pos: "noun", band: "B1", field: "knowledge",
    meaning: "what you have done and learned, or something that happens to you",
    example: "It was a strange experience, but I'd do it again.",
    collocations: ["from experience", "years of experience", "a great experience"] },
  { id: "w-mention", word: "mention", pos: "verb", band: "B1", field: "telling",
    meaning: "say something briefly, without going into detail",
    example: "She mentioned it once and never brought it up again.",
    collocations: ["mention that", "worth mentioning", "not to mention"] },
  { id: "w-involve", word: "involve", pos: "verb", band: "B1", field: "participation",
    meaning: "include something as a necessary part, or bring someone in",
    example: "The job involves a lot of travel.",
    collocations: ["involve doing something", "get involved in"] },
  { id: "w-rely", word: "rely", pos: "verb", band: "B1", field: "trust",
    meaning: "need someone or something and trust them to be there",
    example: "I rely on that bus far more than I should.",
    collocations: ["rely on", "can't rely on"] },
  { id: "w-reduce", word: "reduce", pos: "verb", band: "B1", field: "quantity",
    meaning: "make something smaller in size, amount, or number",
    example: "We reduced the meeting to twenty minutes and got more done.",
    collocations: ["reduce costs", "reduce it to", "greatly reduce"] },
  { id: "w-consider", word: "consider", pos: "verb", band: "B1", field: "thinking",
    meaning: "think carefully about something before deciding",
    example: "I'm considering moving closer to the office.",
    collocations: ["consider doing", "seriously consider", "all things considered"] },
  { id: "w-argue", word: "argue", pos: "verb", band: "B1", field: "conflict",
    meaning: "disagree in words, or give reasons for a position",
    example: "We argued about it for an hour and then agreed.",
    collocations: ["argue with", "argue about", "argue that"] },
  { id: "w-support", word: "support", pos: "verb", band: "B1", field: "help",
    meaning: "help someone, or agree with and back an idea",
    example: "My family supported the decision, even though it was risky.",
    collocations: ["support someone", "strong support", "support the idea"] },
  { id: "w-apply", word: "apply", pos: "verb", band: "B1", field: "work",
    meaning: "make a formal request, or put something into practice",
    example: "I applied for three jobs and heard back from one.",
    collocations: ["apply for", "apply to", "apply what you learn"] },
  { id: "w-offer", word: "offer", pos: "verb", band: "B1", field: "giving",
    meaning: "say you are willing to give or do something",
    example: "He offered to drive me to the station.",
    collocations: ["offer to", "turn down an offer", "a fair offer"] },

  // --- B2 — precision and nuance ---------------------------------------------
  { id: "w-struggle", word: "struggle", pos: "verb", band: "B2", field: "difficulty",
    meaning: "find something very hard and keep trying anyway",
    example: "I still struggle with phone calls in English.",
    collocations: ["struggle with", "struggle to", "a real struggle"] },
  { id: "w-assume", word: "assume", pos: "verb", band: "B2", field: "thinking",
    meaning: "believe something is true without checking",
    example: "I assumed the shop opened at nine — it didn't.",
    collocations: ["assume that", "safe to assume", "wrongly assume"] },
  { id: "w-convince", word: "convince", pos: "verb", band: "B2", field: "persuasion",
    meaning: "make someone believe something or agree to do it",
    example: "It took two weeks to convince my landlord.",
    collocations: ["convince someone to", "hard to convince", "convinced that"] },
  { id: "w-appreciate", word: "appreciate", pos: "verb", band: "B2", field: "gratitude",
    meaning: "be grateful for something, or understand its value",
    example: "I really appreciate you covering for me yesterday.",
    collocations: ["I'd appreciate it if", "fully appreciate"] },
  { id: "w-maintain", word: "maintain", pos: "verb", band: "B2", field: "continuity",
    meaning: "keep something at the same level, or keep it in good condition",
    example: "It's easy to start a habit and hard to maintain one.",
    collocations: ["maintain a habit", "maintain standards", "hard to maintain"] },
  { id: "w-hesitate", word: "hesitate", pos: "verb", band: "B2", field: "choice",
    meaning: "pause before doing something because you're unsure",
    example: "She hesitated for a second, then said yes.",
    collocations: ["hesitate to", "don't hesitate to ask", "hesitate before"] },
  { id: "w-tackle", word: "tackle", pos: "verb", band: "B2", field: "problems",
    meaning: "start dealing with a difficult problem in a determined way",
    example: "I tackle the worst email first thing in the morning.",
    collocations: ["tackle a problem", "tackle it head-on"] },
  { id: "w-adapt", word: "adapt", pos: "verb", band: "B2", field: "change",
    meaning: "change so you fit a new situation",
    example: "It took a month to adapt to the new schedule.",
    collocations: ["adapt to", "quickly adapt", "adapt it for"] },
  { id: "w-emphasize", word: "emphasize", pos: "verb", band: "B2", field: "telling",
    meaning: "give special importance to something you say",
    example: "He emphasized that the deadline would not move.",
    collocations: ["emphasize that", "strongly emphasize", "worth emphasizing"] },
  { id: "w-resist", word: "resist", pos: "verb", band: "B2", field: "self-control",
    meaning: "stop yourself doing something, or fight against it",
    example: "I couldn't resist checking my phone one more time.",
    collocations: ["resist the urge to", "hard to resist", "resist change"] },
  { id: "w-distract", word: "distract", pos: "verb", band: "B2", field: "attention",
    meaning: "take someone's attention away from what they're doing",
    example: "Notifications distract me more than actual people do.",
    collocations: ["distract from", "easily distracted", "a distraction"] },
  { id: "w-justify", word: "justify", pos: "verb", band: "B2", field: "reasoning",
    meaning: "give a good reason for something that seems wrong or extreme",
    example: "I can't justify the price, however nice it looks.",
    collocations: ["justify the cost", "hard to justify", "justify a decision"] },
  { id: "w-delay", word: "delay", pos: "verb", band: "B2", field: "time",
    meaning: "make something happen later than planned",
    example: "The rain delayed everything by two hours.",
    collocations: ["delay a decision", "a long delay", "without delay"] },
  { id: "w-vary", word: "vary", pos: "verb", band: "B2", field: "variation",
    meaning: "be different in different situations",
    example: "Prices vary a lot depending on the season.",
    collocations: ["vary widely", "vary from X to Y", "varies depending on"] },
  { id: "w-tend", word: "tend", pos: "verb", band: "B2", field: "tendency",
    meaning: "usually do something, or usually be a certain way",
    example: "I tend to say yes and regret it later.",
    collocations: ["tend to", "tend towards"] },
  { id: "w-commit", word: "commit", pos: "verb", band: "B2", field: "commitment",
    meaning: "promise firmly to do something and stay with it",
    example: "I've committed to two evenings a week, no more.",
    collocations: ["commit to", "fully committed", "a big commitment"] },
  { id: "w-reasonable", word: "reasonable", pos: "adjective", band: "B2", field: "judgement",
    meaning: "fair and sensible, or acceptable in amount",
    example: "That sounds like a reasonable compromise.",
    collocations: ["a reasonable price", "perfectly reasonable", "be reasonable"] },
  { id: "w-reluctant", word: "reluctant", pos: "adjective", band: "B2", field: "willingness",
    meaning: "unwilling, and slow to agree",
    example: "I was reluctant to speak first, so I waited.",
    collocations: ["reluctant to", "somewhat reluctant"] },
  { id: "w-reliable", word: "reliable", pos: "adjective", band: "B2", field: "trust",
    meaning: "able to be trusted to work or turn up",
    example: "The bus is cheap but nowhere near reliable.",
    collocations: ["a reliable source", "highly reliable"] },
  { id: "w-aware", word: "aware", pos: "adjective", band: "B2", field: "knowledge",
    meaning: "knowing that something exists or is happening",
    example: "I wasn't aware the office closed early on Fridays.",
    collocations: ["aware of", "well aware", "become aware"] },
  { id: "w-flexible", word: "flexible", pos: "adjective", band: "B2", field: "character",
    meaning: "able to change easily to fit a situation",
    example: "My hours are flexible, so tell me what suits you.",
    collocations: ["flexible hours", "stay flexible", "a flexible approach"] },
  { id: "w-efficient", word: "efficient", pos: "adjective", band: "B2", field: "efficiency",
    meaning: "doing something well without wasting time or effort",
    example: "Batching the small tasks is far more efficient.",
    collocations: ["highly efficient", "an efficient way to"] },
  { id: "w-consistent", word: "consistent", pos: "adjective", band: "B2", field: "quality",
    meaning: "always behaving or happening in the same way",
    example: "Ten minutes every day beats three hours once a month — it's consistent.",
    collocations: ["consistent with", "remarkably consistent", "stay consistent"] },
  { id: "w-frustrating", word: "frustrating", pos: "adjective", band: "B2", field: "feelings",
    meaning: "annoying because you can't do what you want",
    example: "Understanding everything and still freezing is the frustrating part.",
    collocations: ["deeply frustrating", "a frustrating experience"] },
  { id: "w-demanding", word: "demanding", pos: "adjective", band: "B2", field: "difficulty",
    meaning: "needing a lot of time, energy, or skill",
    example: "It's a demanding job, but I'm rarely bored.",
    collocations: ["a demanding schedule", "physically demanding"] },
  { id: "w-impressive", word: "impressive", pos: "adjective", band: "B2", field: "admiration",
    meaning: "so good that people admire it",
    example: "Getting it done in one afternoon was genuinely impressive.",
    collocations: ["deeply impressive", "an impressive result"] },
  { id: "w-benefit", word: "benefit", pos: "noun", band: "B2", field: "value",
    meaning: "a good effect or advantage something brings",
    example: "The main benefit of leaving early is the quiet.",
    collocations: ["the benefit of", "benefit from", "of great benefit"] },
  { id: "w-impact", word: "impact", pos: "noun", band: "B2", field: "effects",
    meaning: "the strong effect one thing has on another",
    example: "Cutting the meetings had a bigger impact than I expected.",
    collocations: ["have an impact on", "a huge impact", "the impact of"] },
  { id: "w-priority", word: "priority", pos: "noun", band: "B2", field: "plans",
    meaning: "the thing you treat as most important right now",
    example: "Sleep became a priority once I stopped pretending it wasn't.",
    collocations: ["top priority", "set priorities", "a low priority"] },
  { id: "w-compromise", word: "compromise", pos: "noun", band: "B2", field: "agreement",
    meaning: "an agreement where each side gives up something",
    example: "We reached a compromise: I cook, he cleans.",
    collocations: ["reach a compromise", "a fair compromise"] },
  { id: "w-attempt", word: "attempt", pos: "noun", band: "B2", field: "effort",
    meaning: "a try at doing something difficult",
    example: "It worked on the third attempt.",
    collocations: ["make an attempt", "a failed attempt", "at the first attempt"] },
  { id: "w-estimate", word: "estimate", pos: "verb", band: "B2", field: "measurement",
    meaning: "make a careful guess about an amount or a time",
    example: "I estimated two hours and it took four.",
    collocations: ["roughly estimate", "estimate the cost", "a rough estimate"] },
  { id: "w-acknowledge", word: "acknowledge", pos: "verb", band: "B2", field: "honesty",
    meaning: "accept or admit publicly that something is true",
    example: "She acknowledged the mistake straight away, which helped.",
    collocations: ["acknowledge that", "widely acknowledged", "acknowledge receipt"] },
  { id: "w-ambitious", word: "ambitious", pos: "adjective", band: "B2", field: "self",
    meaning: "wanting to achieve a lot — or, of a plan, aiming very high",
    example: "The timeline was ambitious, and we knew it.",
    collocations: ["an ambitious plan", "overly ambitious"] },

  // --- C1 — the exact word ---------------------------------------------------
  { id: "w-undermine", word: "undermine", pos: "verb", band: "C1", field: "damage",
    meaning: "gradually weaken something, often without meaning to",
    example: "Apologizing for every sentence undermines your own point.",
    collocations: ["undermine confidence", "seriously undermine"] },
  { id: "w-mitigate", word: "mitigate", pos: "verb", band: "C1", field: "risk",
    meaning: "make something bad less severe",
    example: "Booking early mitigates most of the risk.",
    collocations: ["mitigate the risk", "mitigate the impact"] },
  { id: "w-contradict", word: "contradict", pos: "verb", band: "C1", field: "reasoning",
    meaning: "say or be the opposite of something else",
    example: "The two reports contradict each other on the numbers.",
    collocations: ["contradict yourself", "flatly contradict"] },
  { id: "w-leverage", word: "leverage", pos: "verb", band: "C1", field: "advantage",
    meaning: "use something you already have to get more from it",
    example: "She leveraged one small article into a whole career.",
    collocations: ["leverage a relationship", "leverage your strengths"] },
  { id: "w-inevitable", word: "inevitable", pos: "adjective", band: "C1", field: "certainty",
    meaning: "certain to happen; impossible to avoid",
    example: "Some awkward silence is inevitable — it isn't failure.",
    collocations: ["all but inevitable", "the inevitable result"] },
  { id: "w-plausible", word: "plausible", pos: "adjective", band: "C1", field: "credibility",
    meaning: "believable, though possibly not true",
    example: "It's a plausible explanation, but I'd like proof.",
    collocations: ["entirely plausible", "a plausible excuse"] },
  { id: "w-feasible", word: "feasible", pos: "adjective", band: "C1", field: "possibility",
    meaning: "possible to do in practice",
    example: "Finishing by Friday is feasible if nothing else lands.",
    collocations: ["technically feasible", "perfectly feasible"] },
  { id: "w-subtle", word: "subtle", pos: "adjective", band: "C1", field: "subtlety",
    meaning: "not obvious; needing attention to notice",
    example: "The difference is subtle, but native speakers hear it.",
    collocations: ["a subtle difference", "far too subtle"] },
  { id: "w-resilient", word: "resilient", pos: "adjective", band: "C1", field: "character",
    meaning: "able to recover quickly from difficulty",
    example: "You get resilient by being bad at something in public.",
    collocations: ["remarkably resilient", "resilient to"] },
  { id: "w-pragmatic", word: "pragmatic", pos: "adjective", band: "C1", field: "approach",
    meaning: "dealing with things practically rather than ideally",
    example: "The pragmatic answer was to ship it and fix it later.",
    collocations: ["a pragmatic approach", "purely pragmatic"] },
  { id: "w-prone", word: "prone", pos: "adjective", band: "C1", field: "tendency",
    meaning: "likely to do or suffer something, usually bad",
    example: "I'm prone to overthinking the first sentence.",
    collocations: ["prone to", "accident-prone"] },
  { id: "w-ambiguous", word: "ambiguous", pos: "adjective", band: "C1", field: "clarity",
    meaning: "having more than one possible meaning",
    example: "His answer was deliberately ambiguous.",
    collocations: ["deliberately ambiguous", "an ambiguous reply"] },
  { id: "w-compelling", word: "compelling", pos: "adjective", band: "C1", field: "persuasion",
    meaning: "so strong or interesting that you can't ignore it",
    example: "She made a compelling case for starting over.",
    collocations: ["a compelling argument", "compelling evidence"] },
  { id: "w-inherent", word: "inherent", pos: "adjective", band: "C1", field: "nature",
    meaning: "existing as a natural, permanent part of something",
    example: "There's an inherent risk in learning out loud.",
    collocations: ["inherent in", "an inherent flaw"] },
  { id: "w-redundant", word: "redundant", pos: "adjective", band: "C1", field: "excess",
    meaning: "not needed because it repeats something else",
    example: "Half the slides were redundant, so I cut them.",
    collocations: ["largely redundant", "made redundant"] },
  { id: "w-nuance", word: "nuance", pos: "noun", band: "C1", field: "detail",
    meaning: "a very small difference in meaning or feeling",
    example: "The nuance disappears when you translate it word for word.",
    collocations: ["a subtle nuance", "miss the nuance"] },
  { id: "w-constraint", word: "constraint", pos: "noun", band: "C1", field: "limits",
    meaning: "something that limits what you can do",
    example: "Time was the real constraint, not money.",
    collocations: ["a tight constraint", "budget constraints", "work within constraints"] },
  { id: "w-scrutiny", word: "scrutiny", pos: "noun", band: "C1", field: "examination",
    meaning: "careful and critical examination",
    example: "The plan fell apart under any real scrutiny.",
    collocations: ["under scrutiny", "close scrutiny", "come under scrutiny"] },
  { id: "w-discrepancy", word: "discrepancy", pos: "noun", band: "C1", field: "difference",
    meaning: "a difference between things that should match",
    example: "There's a discrepancy between what was promised and what arrived.",
    collocations: ["a clear discrepancy", "a discrepancy between"] },
  { id: "w-deliberate", word: "deliberate", pos: "adjective", band: "C1", field: "intention",
    meaning: "done on purpose, and carefully",
    example: "The pause was deliberate — she wanted the room to think.",
    collocations: ["a deliberate choice", "slow and deliberate"] },
];

const SEED_BY_ID = new Map(WORD_SEEDS.map((w) => [w.id, w]));

export function wordSeedById(id: string): WordSeed | undefined {
  return SEED_BY_ID.get(id);
}

/** How many words the whole curriculum holds — the denominator of "met N of M". */
export const CURRICULUM_SIZE = WORD_SEEDS.length;

const BAND_ORDER: NewsLevel[] = ["A2", "B1", "B2", "C1"];

// --- Choosing a day's set ---------------------------------------------------

/**
 * Draw today's brand-new words. Frequency-first within the learner's band
 * (then the nearest bands as it runs out), and — the rule that matters —
 * **no two words from the same semantic field in one set**, because words
 * taught in a semantic cluster interfere with each other.
 *
 * `met` is every word id the learner has already met, so the curriculum never
 * repeats itself. Deterministic: the same inputs always give the same set.
 */
export function pickDailyWords(opts: {
  level: NewsLevel;
  count: number;
  met: Set<string>;
}): WordSeed[] {
  const { level, count, met } = opts;
  const levelIdx = BAND_ORDER.indexOf(level);

  const candidates = WORD_SEEDS.map((w, i) => ({ w, i }))
    .filter(({ w }) => !met.has(w.id))
    .sort((a, b) => {
      // Nearest band first (below before above at equal distance), then the
      // curriculum's own frequency order.
      const da = Math.abs(BAND_ORDER.indexOf(a.w.band) - levelIdx);
      const db = Math.abs(BAND_ORDER.indexOf(b.w.band) - levelIdx);
      if (da !== db) return da - db;
      const ba = BAND_ORDER.indexOf(a.w.band);
      const bb = BAND_ORDER.indexOf(b.w.band);
      if (ba !== bb) return ba - bb;
      return a.i - b.i;
    })
    .map(({ w }) => w);

  const picked: WordSeed[] = [];
  const fields = new Set<string>();
  for (const w of candidates) {
    if (picked.length >= count) break;
    if (fields.has(w.field)) continue;
    picked.push(w);
    fields.add(w.field);
  }
  // Only if the field rule couldn't fill the set (a nearly-finished curriculum)
  // do we relax it — a short set is worse than two related words.
  if (picked.length < count) {
    for (const w of candidates) {
      if (picked.length >= count) break;
      if (!picked.includes(w)) picked.push(w);
    }
  }
  return picked;
}

/**
 * Resolve the set a day already issued (ids → seeds), dropping any id the
 * curriculum no longer has. Today's set is fixed the moment it's drawn, so
 * reopening the tab mid-session never reshuffles it.
 */
export function seedsFromIds(ids: string[] | undefined): WordSeed[] {
  if (!ids) return [];
  return ids.map(wordSeedById).filter((w): w is WordSeed => !!w);
}

/**
 * Today's review words: items already in the learner's pool that the Leitner
 * schedule says are due. Spacing is the whole reason the daily set is a *mix*
 * — new words alone would be forgotten as fast as they're met.
 */
export function dueReviews(
  pool: Phrase[],
  srs: Record<string, SrsRecord>,
  limit: number,
  today: DayKey = todayKey(),
): Phrase[] {
  return pool
    .filter((p) => srs[p.id] && isDue(srs[p.id], today))
    .sort((a, b) => (srs[a.id]!.box ?? 0) - (srs[b.id]!.box ?? 0))
    .slice(0, Math.max(0, limit));
}

/** Everything a day's session is made of — derived, never stored. */
export interface DaySet {
  /** Today's new words: the set this day issued, or the one it would issue. */
  todaysNew: WordSeed[];
  /** The ones not met yet — what's actually left to do today. */
  remainingNew: WordSeed[];
  /** Curriculum words the Leitner schedule says are ripe again. */
  reviews: Phrase[];
  /** New words met today. */
  done: number;
  /** Items in the session that's waiting: new words left, plus reviews. */
  remaining: number;
}

/**
 * Build today's set. One derivation, used by the mode and by the nav badge, so
 * the two can never disagree about what "today" means.
 *
 * A day's set is fixed the first time it's drawn (`wordDays`), and a word
 * counts as met once it's in the learner's pool — so leaving halfway through
 * and coming back resumes exactly where they were.
 */
export function buildDaySet(opts: {
  wordDays: Record<DayKey, string[]>;
  pool: Phrase[];
  srs: Record<string, SrsRecord>;
  level: NewsLevel;
  perDay: number;
  today?: DayKey;
}): DaySet {
  const { wordDays, pool, srs, level, perDay } = opts;
  const today = opts.today ?? todayKey();
  const met = new Set(pool.map((p) => p.id));

  const issued = seedsFromIds(wordDays[today]);
  const todaysNew =
    issued.length > 0 ? issued : pickDailyWords({ level, count: perDay, met });
  const remainingNew = todaysNew.filter((w) => !met.has(w.id));
  const reviews = dueReviews(
    pool.filter((p) => isDailyWord(p.id)),
    srs,
    MAX_SESSION_ITEMS - remainingNew.length,
    today,
  );

  return {
    todaysNew,
    remainingNew,
    reviews,
    done: todaysNew.length - remainingNew.length,
    remaining: remainingNew.length + reviews.length,
  };
}

// --- Words as pool items ----------------------------------------------------

/** A met word becomes a normal library item: same pool, same Leitner schedule,
 *  so the Phrasebook and the Coach recycle it like anything else. */
export function wordToPhrase(seed: WordSeed, day: DayKey): Phrase {
  return {
    id: seed.id,
    text: seed.word,
    meaning: seed.meaning,
    example: seed.example,
    kind: "word",
    collocations: seed.collocations,
    captured: { module: "Daily words", context: seed.example, day },
  };
}

/** Is this pool item one of the curated daily words? */
export function isDailyWord(id: string): boolean {
  return SEED_BY_ID.has(id);
}

// --- Matching a word inside the learner's own sentence -----------------------

/** Stems that regular English inflection can build on (drop -e, drop -y,
 *  double the final consonant), so "rely" finds "relies" and "stop" "stopped". */
function stemsOf(word: string): string[] {
  const base = word.toLowerCase().trim();
  const stems = new Set([base]);
  if (base.length > 3) {
    if (base.endsWith("e")) stems.add(base.slice(0, -1));
    if (base.endsWith("y")) stems.add(base.slice(0, -1) + "i");
    stems.add(base + base[base.length - 1]);
  }
  return [...stems].map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

const SUFFIXES = "(?:s|es|ed|d|ing|er|ers|est|ly|ment|ness|ion|ions|ation)?";

/**
 * A word as an inflection-tolerant matcher: whole word only, but any normal
 * ending. Used for the recall check and as the offline judging fallback, and
 * server-side to guarantee a setup never leaks the word it's eliciting.
 */
export function wordMatcher(word: string): RegExp {
  return new RegExp(`\\b(?:${stemsOf(word).join("|")})${SUFFIXES}\\b`, "i");
}

/** Did they produce the word (in any normal form) somewhere in this text? */
export function usesWord(word: string, text: string): boolean {
  return wordMatcher(word).test(text);
}

/**
 * The recall check: the learner types the word from its meaning. Any normal
 * inflection counts — this beat tests the form-meaning link, not spelling drill.
 */
export function recallMatches(word: string, typed: string): boolean {
  const t = typed.toLowerCase().replace(/[^a-z' -]/g, "").trim();
  if (!t) return false;
  return new RegExp(`^(?:${stemsOf(word).join("|")})${SUFFIXES}$`, "i").test(t);
}

/** A partner chunk with the word itself hidden — a cue that helps recall
 *  without giving the answer away ("make a ___" for "decision"). */
export function maskCollocation(chunk: string, word: string): string {
  return chunk.replace(new RegExp(wordMatcher(word).source, "gi"), "___");
}

// --- Offline round material --------------------------------------------------

/** The instruction each part of speech gets when the AI round isn't available. */
export const LOCAL_WORD_TASKS: Record<WordPos, string> = {
  verb: "Answer in one true sentence about your own life — use the word as an action.",
  noun: "Answer in one true sentence about your own life — make the word the thing you're talking about.",
  adjective: "Answer in one true sentence about your own life — use the word to describe something real.",
  adverb: "Answer in one true sentence about your own life — use the word to say how something happens.",
};

/**
 * Generic moments used when the round-builder is unreachable. They're
 * deliberately open — they can host any word — so an offline session is still
 * production, just less tailored.
 */
export const LOCAL_WORD_SETUPS: string[] = [
  "A friend asks how your week is actually going — not the polite version.",
  "Someone at work asks what you're planning to do about it.",
  "A friend is deciding whether to make a big change and wants your honest take.",
  "You're telling someone what yesterday was really like.",
  "Someone asks what you'd tell a person starting out where you started.",
  "A friend asks what you'd change about how this month has gone.",
  "You're explaining to someone why you do it the way you do.",
  "Someone asks what the hardest part has been so far.",
  "A friend asks what you're looking forward to, and why.",
  "You're telling someone about a small thing that made a real difference.",
];
