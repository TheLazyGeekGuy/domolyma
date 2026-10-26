import fr from "./fr.json";

/** Keep API wording stable while keeping interface strings outside the code. */
export const sourceText = (key: keyof typeof fr): string => fr[key];
