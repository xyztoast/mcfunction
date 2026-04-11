// Cache to store command JSONs
const commandCache = {};

// Cache for selector args (loaded from backend/commands/other/selector_args.json)
let selectorArgKeys = null;

/**
 * Load selector arg keys from backend/commands/other/selector_args.json
 */
(async function loadSelectorArgs() {
    try {
        const response = await fetch("./backend/commands/other/selector_args.json");
        if (response.ok) {
            const data = await response.json();
            selectorArgKeys = data.keys || [];
        }
    } catch (e) { /* silent fail */ }
})();

/**
 * Validate the contents of a @x[...] selector bracket against known bedrock keys.
 * Returns true if all key=value pairs use known keys, false otherwise.
 */
function validateSelectorArgs(bracketContent) {
    if (!selectorArgKeys) return true; // not loaded yet, let it pass
    // bracketContent is the string inside the [...] brackets
    // split on commas, then check each key=value pair
    const pairs = bracketContent.split(",");
    for (let pair of pairs) {
        pair = pair.trim();
        if (!pair) continue;
        // key=value or key=!value or key={...} (for scores/hasitem)
        const eqIdx = pair.indexOf("=");
        if (eqIdx === -1) return false;
        const key = pair.slice(0, eqIdx).trim().toLowerCase();
        if (!selectorArgKeys.includes(key)) return false;
    }
    return true;
}

/**
 * The "Brain" - Processes segments with the "Elimination Race" logic
 */
function processSegmentsSync(segments) {
    let processed = "";
    let commandData = null;
    let activePatterns = []; // This holds all the valid paths we are currently racing
    let argCounter = 0;
    let restOfLineMode = false;
    let restOfLineClass = "";
    let inString = false;       // true when inside an open quoted string
    let executeChainMode = false; // true when inside execute subclauses (before run)

    for (let i = 0; i < segments.length; i++) {
        let segment = segments[i];

        // Preserve whitespace
        if (segment.trim() === "") {
            processed += segment;
            continue;
        }

        const segmentLower = segment.toLowerCase();

        // --- STRING CARRY MODE ---
        // If we're inside an open quoted string, keep consuming segments as hl-item
        // until we find one that ends with an unescaped "
        if (inString) {
            processed += `<span class="hl-item">${escapeHtml(segment)}</span>`;
            // Check if this segment closes the string (ends with " not preceded by \)
            if (segment.endsWith('"') && !segment.endsWith('\\"')) {
                inString = false;
            }
            continue;
        }

        if (!commandData) {
            // --- SLASH CHECK ---
            if (!commandData && segment.startsWith("/")) {
                processed += `<span class="hl-error">${escapeHtml(segment)}</span>`;
                break;
            }

            // Check cache for the base command (e.g., "give", "tickingarea")
            commandData = commandCache[segmentLower];

            if (commandData) {
                processed += `<span class="hl-command">${escapeHtml(segment)}</span>`;
                
                // Initialize the Race!
                if (commandData.overloads) {
                    // If it has multiple paths, load them all
                    activePatterns = commandData.overloads.map(o => o.pattern);
                } else if (commandData.pattern) {
                    // If it's a simple file like fill.json, just load the one path
                    activePatterns = [commandData.pattern];
                } else {
                    activePatterns = [];
                }

                // If this is execute, enter chain mode
                if (commandData.command === "execute") {
                    executeChainMode = true;
                }

            } else {
                // Not in cache? Fetch for next time and mark as error for now
                fetchCommandGrammar(segmentLower); 
                processed += `<span class="hl-error">${escapeHtml(segment)}</span>`;
            }
        } else {
            // Handle Execute run keyword — exits chain mode and recurses
            if (segmentLower === "run" && executeChainMode) {
                processed += `<span class="hl-command">run</span>`;
                // Process the rest of the line as a new command
                processed += processSegmentsSync(segments.slice(i + 1));
                break; 
            }

            // If we hit a restOfLine trigger previously, keep using that class
            if (restOfLineMode) {
                processed += `<span class="${restOfLineClass}">${escapeHtml(segment)}</span>`;
                continue;
            }

            // --- THE ELIMINATION RACE ---
            let bestClass = "hl-error";
            let matchedExpected = null;

            // Filter down the patterns to only the ones that match the current word
            let survivingPatterns = activePatterns.filter(pattern => {
                let expected = pattern[argCounter];
                
                // If this pattern ran out of arguments but the user is still typing, eliminate it
                if (!expected) return false; 
                
                let cssClass = getHighlightClass(segment, expected);
                // If the class isn't an error, this pattern survives!
                return cssClass !== "hl-error";
            });

            if (survivingPatterns.length > 0) {
                // We have a match! Update our active list to only the survivors
                activePatterns = survivingPatterns;
                
                // Grab the expected object from the first survivor to determine the CSS/RestOfLine
                matchedExpected = activePatterns[0][argCounter];
                bestClass = getHighlightClass(segment, matchedExpected);
            } else {
                // No patterns matched. The user typed an error.
                bestClass = "hl-error";

                // --- EXECUTE CHAIN RESET ---
                // If we're in execute chain mode and the current word didn't match,
                // try resetting argCounter to 0 and re-matching against the execute overloads.
                // This allows chaining: "at @a positioned ~ ~ ~ as @s ..."
                if (executeChainMode && commandData) {
                    let resetPatterns = commandData.overloads
                        ? commandData.overloads.map(o => o.pattern)
                        : (commandData.pattern ? [commandData.pattern] : []);

                    let resetSurvivors = resetPatterns.filter(pattern => {
                        let expected = pattern[0];
                        if (!expected) return false;
                        return getHighlightClass(segment, expected) !== "hl-error";
                    });

                    if (resetSurvivors.length > 0) {
                        // Valid new subclause keyword — reset the race
                        activePatterns = resetSurvivors;
                        argCounter = 0;
                        matchedExpected = activePatterns[0][0];
                        bestClass = getHighlightClass(segment, matchedExpected);
                    }
                }
            }

            // Check for the new restOfLine state using the winning pattern
            if (matchedExpected && matchedExpected.restOfLine === "true") {
                restOfLineMode = true;
                restOfLineClass = bestClass;
            }

            // --- STRING OPEN CHECK ---
            // If this segment starts with " but doesn't end with a closing " it opens a string
            if (bestClass === "hl-item" || bestClass === "hl-error") {
                if (segment.startsWith('"') && !(segment.length > 1 && segment.endsWith('"') && !segment.endsWith('\\"'))) {
                    inString = true;
                    bestClass = "hl-item";
                }
            }

            processed += `<span class="${bestClass}">${escapeHtml(segment)}</span>`;
            argCounter++;

            // --- THE 3 LINES FOR CHAINING ---
            if (activePatterns.length > 0 && argCounter >= activePatterns[0].length && !restOfLineMode) {
                argCounter = 0; 
            }
        }
    }
    return processed;
}

/**
 * Background Fetcher
 */
async function fetchCommandGrammar(cmd) {
    if (commandCache[cmd] || !cmd) return;
    try {
        const response = await fetch(`./backend/commands/${cmd}.json`);
        if (response.ok) {
            const data = await response.json();
            commandCache[cmd] = data;
            // Re-run highlighting now that we have the data
            if (typeof updateHighlighting === "function") updateHighlighting();
        }
    } catch (e) { /* silent fail */ }
}

/**
 * Helper: Mapping JSON types to CSS classes
 */
function getHighlightClass(word, expected) {
    if (!expected) return ""; 

    switch (expected.type) {
        case "target": 
            return /^(@[a-p|e|s|r|v]|@[a-p|e|s|r|v]\[.*\]|[A-Za-z0-9_]{3,16})$/i.test(word) ? "hl-selector" : "hl-error";
        case "selector_arg": {
            // Must match @x[...] format, and keys inside brackets must be valid bedrock selector args
            const match = word.match(/^@[aeprsv]\[(.*)\]$/i);
            if (!match) return "hl-error";
            return validateSelectorArgs(match[1]) ? "hl-selector" : "hl-error";
        }
        case "string": {
            // A quoted string — starts and ends with "
            // Single word: "hello" — valid
            // If it only starts with " it will be caught by the inString carry logic above
            if (word.startsWith('"') && word.endsWith('"') && word.length >= 2) return "hl-item";
            if (word.startsWith('"')) return "hl-item"; // opening — carry handles the rest
            return "hl-error";
        }
        case "word":
            if (expected.options) {
                if (expected.options.includes("*")) return "hl-item"; 
                if (expected.options.includes(word.toLowerCase())) return "hl-word"; 
            }
            if (expected.restOfLine === "true") return "hl-item";
            return "hl-error";
        case "item_id": 
            return /^([a-z0-9_]+:)?[a-z0-9_]+$/.test(word) ? "hl-item" : "hl-error";
        case "int": 
            // 1. Check if it's a valid coordinate (~, ^) or decimal number
            const isNumeric = /^([~^]-?\d*\.?\d*|-?\d+\.?\d*)$/.test(word);
            if (!isNumeric) return "hl-error";

            // 2. If it's a raw number (not relative), check min/max constraints
            if (/^-?\d+\.?\d*$/.test(word)) {
                const val = parseFloat(word);
                if (expected.min !== undefined && val < expected.min) return "hl-error";
                if (expected.max !== undefined && val > expected.max) return "hl-error";
            }
            return "hl-number";
        default: return "";
    }
}

function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
