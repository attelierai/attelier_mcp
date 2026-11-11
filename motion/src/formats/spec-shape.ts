/** Cheap shape checks must run before media probes or a Remotion bundle. */
const object = (value: unknown, at: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${at}: expected a JSON object, not a file path. Read the spec file first.`);
  return value as Record<string, unknown>;
};
const list = (value: unknown, at: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${at}: expected an array.`);
  return value;
};
const string = (value: unknown, at: string) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${at}: expected a non-empty string.`);
};
const strings = (value: unknown, at: string) => list(value, at).forEach((item, i) => string(item, `${at}[${i}]`));
const number = (value: unknown, at: string, min = 0, max = Infinity) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`${at}: expected a finite number between ${min} and ${max}.`);
};

export const validateCommonShape = (value: unknown) => {
  const spec = object(value, "spec");
  if (spec.fps !== undefined && spec.fps !== 30 && spec.fps !== 60) throw new Error("fps: expected 30 or 60.");
  if (spec.endcard !== undefined) {
    const card = object(spec.endcard, "endcard");
    if (card.tagline !== undefined) strings(card.tagline, "endcard.tagline");
  }
  return spec;
};

export const validateShootoutShape = (value: unknown) => {
  const spec = validateCommonShape(value);
  const models = list(spec.models, "models");
  models.forEach((value, i) => {
    const model = object(value, `models[${i}]`);
    string(model.name, `models[${i}].name`);
    string(model.maker, `models[${i}].maker`);
  });
  const shots = list(spec.shots, "shots");
  shots.forEach((value, r) => {
    const at = `shots[${r}]`, shot = object(value, at);
    string(shot.title, `${at}.title`);
    list(shot.clips, `${at}.clips`).forEach((value, i) => {
      const at = `shots[${r}].clips[${i}]`, clip = object(value, at);
      string(clip.video, `${at}.video`);
      number(clip.fromSeconds, `${at}.fromSeconds`);
      if (clip.genSeconds !== undefined) number(clip.genSeconds, `${at}.genSeconds`, Number.MIN_VALUE);
      if (clip.costUsd !== undefined) number(clip.costUsd, `${at}.costUsd`);
    });
  });
  if (spec.hook !== undefined) strings(spec.hook, "hook");
  if (spec.clipAudio !== undefined) number(spec.clipAudio, "clipAudio", 0, 1);
  if (spec.music !== undefined) {
    const music = object(spec.music, "music");
    string(music.src, "music.src");
    number(music.beatSeconds, "music.beatSeconds", Number.MIN_VALUE);
    number(music.firstBeatSeconds, "music.firstBeatSeconds");
    number(music.offsetBeats, "music.offsetBeats");
    if (music.volume !== undefined) number(music.volume, "music.volume", 0, 1);
  }
  if (spec.beats !== undefined) {
    const beats = object(spec.beats, "beats");
    for (const key of ["solo", "grid", "race", "vote", "endcard"]) if (beats[key] !== undefined) number(beats[key], `beats.${key}`, key === "race" ? 0 : 1, 64);
    if (typeof beats.race === "number" && beats.race > 0 && beats.race <= 5) throw new Error("beats.race: use 0 to omit it, or more than 5 beats for the counters.");
  }
  if (spec.vote !== undefined) {
    const vote = object(spec.vote, "vote");
    for (const key of ["title", "cta"]) if (vote[key] !== undefined) string(vote[key], `vote.${key}`);
    if (vote.shot !== undefined) {
      number(vote.shot, "vote.shot", 0, shots.length - 1);
      if (!Number.isInteger(vote.shot)) throw new Error("vote.shot: expected a round index (integer).");
    }
  }
};
