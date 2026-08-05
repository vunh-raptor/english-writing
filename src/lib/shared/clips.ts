import type { NewsLevel, TranscribeClip, TranscribeCue } from "@/types";

/**
 * The Transcribe listening curriculum (docs/TRANSCRIBE.md).
 *
 * Like the daily-word spine in `words.ts`, this is bundled content with no I/O
 * and no key behind it: the mode that asks someone to listen has to work on the
 * train. Each clip ships its own transcript, so the gate — score, diff, missed
 * words, milestone — runs entirely on-device.
 *
 * Cue timings are DERIVED from the prose at a stated speaking rate rather than
 * hand-written. Hand-timing a thousand words invites drift between the text and
 * the clock, and the clock is what the chunk cut trusts.
 *
 * A clip with a `videoId` plays as real video through the YouTube player; one
 * without is read aloud by the browser's own voice, labelled honestly as such.
 * Filling in a `videoId` is the only change needed to switch a clip over.
 */

/** Words per caption line — roughly what a broadcast subtitle carries. */
const WORDS_PER_LINE = 11;

/** Split prose into sentences, keeping their terminal punctuation. */
function sentences(prose: string): string[] {
  return prose
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
}

/**
 * Turn narration into timed caption lines at a given speaking rate. Every line
 * that ends a sentence keeps its full stop, which is what lets `cutIntoChunks`
 * land its cuts on sentence boundaries rather than mid-clause.
 */
function cueProse(prose: string, wpm: number): TranscribeCue[] {
  const perWord = 60 / wpm;
  const cues: TranscribeCue[] = [];
  let clock = 0;

  for (const sentence of sentences(prose)) {
    const words = sentence.split(" ");
    let i = 0;
    while (i < words.length) {
      // Take a full line, unless that would orphan a word or two onto a line
      // of their own — then take the rest of the sentence.
      const remaining = words.length - i;
      const take = remaining - WORDS_PER_LINE <= 2 ? remaining : WORDS_PER_LINE;
      const line = words.slice(i, i + take);
      const start = clock;
      clock += line.length * perWord;
      cues.push({ start: round(start), end: round(clock), text: line.join(" ") });
      i += take;
    }
  }
  return cues;
}

/** Two decimals is finer than any seek the UI performs. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

interface ClipSeed {
  id: string;
  title: string;
  source: string;
  level: NewsLevel;
  blurb: string;
  /** Delivery speed. Narration sits near 150; a lecture runs slower. */
  wpm: number;
  videoId?: string;
  prose: string;
}

// ---------------------------------------------------------------------------
// The clips
// ---------------------------------------------------------------------------

const SEEDS: ClipSeed[] = [
  {
    id: "clip-reefs",
    title: "Why the reefs turn white",
    source: "Deep Field · Ocean series",
    level: "C1",
    blurb: "Narration, one speaker, no music under the voice — the cleanest place to start.",
    wpm: 164,
    prose: `
Coral reefs cover less than one percent of the ocean floor, yet they support a quarter of all marine species. When the water warms by a single degree, the algae that feed the coral are expelled, and the reef turns white.

That is the sentence everyone knows, and almost everyone misunderstands. A bleached reef is not a dead reef. It is a starving one. The coral animal is still there, still building, still holding its shape against the current. What has gone is the tenant.

For most of the last ten thousand years, coral has run a quiet arrangement. Inside its tissue lives a single-celled alga, and that alga does the cooking. It takes sunlight and turns it into sugar, and it hands most of that sugar to its landlord. In return it gets shelter, and a steady supply of the waste chemicals it needs. Nine tenths of what a coral eats arrives this way, without the coral moving at all.

The arrangement is exquisitely tuned, and that is precisely the problem. Warm the water past the range the partnership evolved in, and the alga's chemistry begins to misfire. It starts producing compounds that damage the tissue around it. The coral, in effect, evicts its own kitchen.

What is left behind is a transparent animal over a white limestone skeleton, and that is the colour we see. The reef is not bleached in the way a shirt is bleached. We are looking straight through it, at bone.

A coral can survive this for a few weeks. Some can survive it for a few months, drawing on reserves and catching what plankton drifts past. But a starving animal does not build, and a reef that does not build begins to lose ground to the sea. Storms take the branches. Boring sponges take the base. Within a year, a bleached reef that never got its algae back is rubble with a film of weed across it.

The recovery, when it comes, is slower than anyone would like. Larvae have to arrive from somewhere else, settle on clean rock, and survive their first year. On a healthy reef that happens constantly and invisibly. On a damaged one it depends entirely on what is still alive upstream.

And this is where the story stops being about temperature alone. A reef that is otherwise intact — clean water, full fish population, no runoff from the land — recovers from bleaching far better than one already under pressure. The heat is what pushes the reef over. Everything else decides whether it can climb back.

Parrotfish matter more than almost anyone expects. They spend their days scraping weed off dead coral, which is unglamorous work and absolutely essential, because coral larvae will not settle on an algal mat. Take the parrotfish out and the rubble stays rubble. Leave them in and the same rubble is seeded within two seasons.

So the question is not really whether reefs can survive warming. Some of them clearly can. The question is which reefs still have everything else they need on the morning after the heat passes.

There is a reef in the northern Red Sea that has spent the last decade embarrassing the models. The water there runs hotter than almost anywhere corals are supposed to tolerate, and the corals are fine. Not surviving. Thriving, with a cover of live coral that would be respectable on a reef half the temperature.

The explanation appears to lie ten thousand years in the past. To reach the Red Sea at all, coral larvae had to pass through a strait in the south where the water is warmer still. Only the most heat-tolerant survived the journey. Everything living in the north today is descended from that filtered population, and it carries a thermal tolerance it has never actually needed.

That is a genuinely hopeful finding, and it is routinely oversold. A reef that tolerates heat is not a reef that tolerates everything. The same corals are highly sensitive to nutrient pollution, and the coastline above them is developing fast.

Which brings us to the awkward part of reef conservation. Almost every intervention that works is local, and almost every cause is not. You can stop the runoff. You can protect the parrotfish. You can ban anchoring, and restrict the fishing, and none of that touches the temperature of the ocean.

What local work buys is time, and time is not a small thing. A reef in good condition can lose half its coral to a bleaching event and be back within a decade. A reef already stripped of its herbivores does not come back at all. The heat sets the schedule. Everything else decides who is still standing when it arrives.
`,
  },
  {
    id: "clip-cars",
    title: "The city that removed its cars",
    source: "Field Report",
    level: "B2",
    blurb: "Two speakers, some street noise — harder listening, shorter sentences.",
    wpm: 152,
    prose: `
Thirty years ago this street carried eighteen thousand cars a day. Today it carries none, and the shops along it are busier than they have ever been.

That result surprised almost everybody, including the people who planned it. The shopkeepers fought the scheme hardest. They were certain that closing the road would close their businesses, and they said so, loudly, for two years.

They were working from a reasonable assumption. If customers arrive by car, and you take away the car, the customers go somewhere else. The council thought so too, quietly, which is why the first closure was only meant to last six months.

What the surveys had missed was simple. The shopkeepers believed that most of their customers drove in. When the council actually counted, the figure was under a quarter. The rest walked, cycled, or came off the tram, and had been doing so all along.

Once the cars were gone, something else happened that nobody had modelled. The pavement stopped being a corridor and started being a place. People stood still on it. They met each other on it. The average visit went from nineteen minutes to just over forty, and a person who stays forty minutes buys roughly twice as much as a person who stays nineteen.

There is a harder lesson underneath the happy one. The scheme worked because the alternatives were already there. The tram ran every four minutes. The cycle lanes were separated from traffic, not painted beside it. The bus network had been rebuilt the decade before, at considerable expense, and largely without credit.

Cities that copied the closure without doing that groundwork got a very different outcome. You cannot remove a road and expect the trips on it to vanish. They move, and if there is nowhere good for them to move to, they move into the streets behind, and the people who live there pay for a decision they were never asked about.

Ask the planners here what they would do differently and they say the same thing, more or less. Do the boring part first. Build the thing people will switch to, prove that it works, and only then take the road away.

There is one more detail worth mentioning, because it is the part that nearly sank the scheme. The six-month trial was extended three times before it was made permanent, and each extension was fought over.

The traffic did not settle for almost a year. For the first eight months the surrounding streets were genuinely worse, and the people complaining about it were right to complain. What changed was not the road layout. It was that enough people, gradually, stopped making the trip by car at all.

Planners have a name for that. They call it traffic evaporation, and it is very badly named, because nothing evaporates. The journeys are still made. They are made differently, by people who reorganised their week around a change they did not ask for, and that reorganisation takes about a year.

If you shut the trial down at month six, which is when the pressure is greatest, you will conclude that it failed. It had not failed. It had not finished.
`,
  },
  {
    id: "clip-weather",
    title: "What a hundred years of weather records show",
    source: "Lecture",
    level: "C1",
    blurb: "Academic register, dense with figures — the numbers are the hard part.",
    wpm: 138,
    prose: `
I want to start with the least glamorous object in climate science, which is a handwritten notebook.

Between eighteen eighty and nineteen sixty, most of what we know about the weather was recorded by hand, twice a day, by people who were not scientists. Lighthouse keepers. Harbour masters. Schoolteachers. They read a thermometer, they wrote a number in a column, and they did it again the next morning.

Those columns are now our baseline, and working with them is considerably harder than it sounds. Consider a single station that has been reading temperature since eighteen ninety-four. Over that period, the thermometer has been replaced four times. The screen housing it was moved twice, once by about forty metres. The observation hour changed in nineteen twenty-eight, from nine in the morning to eight. And the field the station stands in became, at some point in the nineteen sixties, a car park.

Every one of those changes puts a step in the record that has nothing to do with the climate. The move of forty metres is worth about a fifth of a degree. The change of observation hour is worth rather more than that. And the car park, which absorbs heat all day and releases it at night, is worth as much as everything else combined.

So the raw record cannot be read directly, and the work of the last forty years has largely been the work of finding those steps and correcting for them. The technique is called homogenisation, and the principle behind it is straightforward enough. A genuine change in climate shows up at every station in a region at once. A change in a car park shows up at one.

You compare each station against its neighbours, you look for the moments where it steps away from all of them simultaneously, and you treat those moments as artefacts rather than weather.

This is, I think, worth dwelling on, because the adjustments are routinely presented as though they were a thumb on the scale. They are the opposite. They are the reason the record can be trusted at all. And it is worth knowing which way they push: across the global land and ocean record, the net effect of all this correction is to reduce the measured warming slightly, not to increase it.

The largest single correction in the entire dataset is to sea surface temperature in the nineteen forties, and it exists because of how the water was collected. Before the war, ships measured temperature by throwing a canvas bucket over the side and hauling it up. Canvas evaporates, and evaporation cools, so those readings run low. During the war, for reasons of blackout and safety, ships switched to reading the temperature of the water drawn in to cool the engines, which runs warm.

The result is a step in the middle of the twentieth century that is entirely an artefact of the bucket.
`,
  },
];

/** Bundled clips, cued and ready — the mode's offline spine. */
export const CLIPS: TranscribeClip[] = SEEDS.map((seed) => {
  const cues = cueProse(seed.prose, seed.wpm);
  return {
    id: seed.id,
    title: seed.title,
    source: seed.source,
    level: seed.level,
    blurb: seed.blurb,
    ...(seed.videoId ? { videoId: seed.videoId } : {}),
    duration: cues.length > 0 ? Math.ceil(cues[cues.length - 1].end) : 0,
    cues,
  };
});

export function findClip(id: string): TranscribeClip | undefined {
  return CLIPS.find((c) => c.id === id);
}
