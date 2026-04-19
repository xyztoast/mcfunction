// Cache to store command JSONs
const commandCache = {};

// Cache for color codes (loaded from backend/colorcodes.json)
const colorCodeCache = {};

// Cache for selector args (loaded from backend/commands/other/selector_args.json)
let selectorArgKeys = null;

/**
 * Load color codes from backend/colorcodes.json
 */
(async function loadColorCodes() {
    try {
        const response = await fetch("https://mcbcode.com/backend/colorcodes.json");
        if (response.ok) {
            const data = await response.json();
            Object.assign(colorCodeCache, data);
        }
    } catch (e) { /* silent fail */ }
})();

/**
 * Load selector arg keys from backend/commands/other/selector_args.json
 */
(async function loadSelectorArgs() {
    try {
        const response = await fetch("https://mcbcode.com/backend/commands/other/selector_args.json");
        if (response.ok) {
            const data = await response.json();
            selectorArgKeys = data.keys || [];
        }
    } catch (e) { /* silent fail */ }
})();

/**
 * Renders a target selector segment as split html.
 * @x or @x[key=val,...] — the @x[ and ] are hl-selector, key=value pairs are hl-word,
 * commas are hl-selector. plain @x or player name is just hl-selector.
 * Returns { html, valid }
 */
function renderTarget(word) {
    // Plain player name
    if (/^[A-Za-z0-9_]{3,16}$/.test(word)) {
        return { html: `<span class="hl-selector">${escapeHtml(word)}</span>`, valid: true };
    }

    // @x with no brackets
    if (/^(@[aeprsv])$/i.test(word)) {
        return { html: `<span class="hl-selector">${escapeHtml(word)}</span>`, valid: true };
    }

    // @x[...] with brackets
    const bracketMatch = word.match(/^(@[aeprsv])\[(.*)\]$/i);
    if (!bracketMatch) {
        return { html: `<span class="hl-error">${escapeHtml(word)}</span>`, valid: false };
    }

    const prefix = bracketMatch[1];
    const inner = bracketMatch[2];

    // Validate keys if loaded
    let innerValid = true;
    if (selectorArgKeys) {
        const pairs = inner.split(",");
        for (let pair of pairs) {
            pair = pair.trim();
            if (!pair) continue;
            const eqIdx = pair.indexOf("=");
            if (eqIdx === -1) { innerValid = false; break; }
            const key = pair.slice(0, eqIdx).trim().toLowerCase();
            if (!selectorArgKeys.includes(key)) { innerValid = false; break; }
        }
    }

    if (!innerValid) {
        return { html: `<span class="hl-error">${escapeHtml(word)}</span>`, valid: false };
    }

    // Split render: @x[ = hl-selector, key=value = hl-word, commas+] = hl-selector
    let html = `<span class="hl-selector">${escapeHtml(prefix)}[</span>`;
    const pairs = inner.split(",");
    for (let j = 0; j < pairs.length; j++) {
        html += `<span class="hl-word">${escapeHtml(pairs[j])}</span>`;
        if (j < pairs.length - 1) html += `<span class="hl-selector">,</span>`;
    }
    html += `<span class="hl-selector">]</span>`;

    return { html, valid: true };
}

/**
 * Apply §x color codes within a segment string.
 * Only hex color values (#xxxxxx) are applied — l, o, k etc are ignored.
 * Returns { html, activeColor }
 */
function applyColorCodes(text, cssClass, incomingColor) {
    const pattern = /§([0-9a-fA-FrR])/g;
    let result = "";
    let lastIndex = 0;
    let currentColor = incomingColor || null;

    function wrapChunk(chunk) {
        if (!chunk) return "";
        const escaped = escapeHtml(chunk);
        if (currentColor) return `<span class="${cssClass}" style="color:${currentColor}">${escaped}</span>`;
        return `<span class="${cssClass}">${escaped}</span>`;
    }

    function renderChunk(chunk) {
        if (!chunk) return "";
        const quoteIdx = chunk.indexOf('"');
        if (quoteIdx !== -1) {
            const out = wrapChunk(chunk.slice(0, quoteIdx + 1));
            currentColor = null;
            return out + wrapChunk(chunk.slice(quoteIdx + 1));
        }
        return wrapChunk(chunk);
    }

    let match;
    while ((match = pattern.exec(text)) !== null) {
        result += renderChunk(text.slice(lastIndex, match.index));
        const code = match[1].toLowerCase();
        const value = colorCodeCache[code];
        if (code === "r") currentColor = null;
        else if (value && value.startsWith("#")) currentColor = value;
        // non-color codes (l, o, k) silently ignored
        result += `<span class="hl-colorcode">${escapeHtml(match[0])}</span>`;
        lastIndex = pattern.lastIndex;
    }
    result += renderChunk(text.slice(lastIndex));
    return { html: result, activeColor: currentColor };
}

function hasColorCodes(text) {
    return text.includes("§");
}

/**
 * Render a segment with color code support on top of a css class.
 * Returns { html, activeColor }
 */
function renderSegment(segment, cssClass, activeColor) {
    if (hasColorCodes(segment)) {
        return applyColorCodes(segment, cssClass, activeColor);
    }
    let nextColor = activeColor;
    let html;
    if (activeColor) {
        html = `<span class="${cssClass}" style="color:${activeColor}">${escapeHtml(segment)}</span>`;
        if (segment.includes('"')) nextColor = null;
    } else {
        html = `<span class="${cssClass}">${escapeHtml(segment)}</span>`;
    }
    return { html, activeColor: nextColor };
}

/**
 * Get the root overload patterns for a command — used for execute chain resets
 */
function getRootPatterns(commandData) {
    if (commandData.overloads) return commandData.overloads.map(o => o.pattern);
    if (commandData.pattern) return [commandData.pattern];
    return [];
}

/**
 * Expand nested patterns from a set of surviving patterns at a given argCounter.
 * Returns the nested patterns array, or empty array if none exist.
 */
function expandNestedPatterns(survivingPatterns, argCounter, segment) {
    let nestedPatterns = [];
    for (let sp of survivingPatterns) {
        let exp = sp[argCounter];
        if (!exp) continue;
        if (getHighlightClass(segment, exp) === "hl-error") continue;
        if (exp.overloads && Array.isArray(exp.overloads)) {
            for (let ov of exp.overloads) {
                if (ov.pattern) nestedPatterns.push(ov.pattern);
            }
        } else if (exp.pattern && Array.isArray(exp.pattern)) {
            nestedPatterns.push(exp.pattern);
        }
    }
    return nestedPatterns;
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
    let activeColor = null; // Tracks carried §x color across segments

    // Execute chain state
    // rootPatterns: top-level execute overloads, used to reset after each subcommand
    // inNestedPattern: true while consuming args inside a subcommand's nested pattern,
    //   blocks chain resets so "@s" after "as" isnt mistaken for a new subcommand
    let rootPatterns = [];
    let inNestedPattern = false;

    for (let i = 0; i < segments.length; i++) {
        let segment = segments[i];

        // Preserve whitespace
        if (segment.trim() === "") {
            processed += segment;
            continue;
        }

        const segmentLower = segment.toLowerCase();

        if (!commandData) {
            // --- SLASH CHECK ---
            if (segment.startsWith("/")) {
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

                // Store root patterns for execute chain resets
                if (commandData.command === "execute") {
                    rootPatterns = getRootPatterns(commandData);
                }

            } else {
                // Not in cache? Fetch for next time and mark as error for now
                fetchCommandGrammar(segmentLower); 
                processed += `<span class="hl-error">${escapeHtml(segment)}</span>`;
            }
        } else {
            // Handle Execute run keyword
            if (segmentLower === "run" && commandData.command === "execute") {
                processed += `<span class="hl-command">run</span>`;
                // Process the rest of the line as a new command
                processed += processSegmentsSync(segments.slice(i + 1));
                break; 
            }

            // If we hit a restOfLine trigger previously, keep using that class
            if (restOfLineMode) {
                const r = renderSegment(segment, restOfLineClass, activeColor);
                processed += r.html;
                activeColor = r.activeColor;
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

                // --- NESTED PATTERN EXPANSION ---
                // Only expand at the subcommand keyword level (not mid-nested-args)
                if (!inNestedPattern) {
                    const nestedPatterns = expandNestedPatterns(survivingPatterns, argCounter, segment);
                    if (nestedPatterns.length > 0) {
                        activePatterns = nestedPatterns;
                        argCounter = -1; // incremented to 0 at end of loop
                        inNestedPattern = true;
                    }
                }

            } else {
                // No patterns matched.

                // --- EXECUTE CHAIN RESET ---
                // Only when in execute mode and NOT mid-nested-pattern args
                if (commandData.command === "execute" && !inNestedPattern && rootPatterns.length > 0) {
                    const resetSurvivors = rootPatterns.filter(pattern => {
                        const expected = pattern[0];
                        if (!expected) return false;
                        return getHighlightClass(segment, expected) !== "hl-error";
                    });

                    if (resetSurvivors.length > 0) {
                        activePatterns = resetSurvivors;
                        argCounter = 0;
                        matchedExpected = activePatterns[0][0];
                        bestClass = getHighlightClass(segment, matchedExpected);

                        // Expand nested patterns for the new subcommand keyword
                        const nestedPatterns = expandNestedPatterns(resetSurvivors, 0, segment);
                        if (nestedPatterns.length > 0) {
                            activePatterns = nestedPatterns;
                            argCounter = -1;
                            inNestedPattern = true;
                        }
                    } else {
                        bestClass = "hl-error";
                    }
                } else {
                    bestClass = "hl-error";
                }
            }

            // Check for the new restOfLine state using the winning pattern
            if (matchedExpected && matchedExpected.restOfLine === "true") {
                restOfLineMode = true;
                restOfLineClass = bestClass;
            }

            // --- RENDER ---
            // Target type gets split render, everything else goes through renderSegment
            // for color code support
            if (matchedExpected && matchedExpected.type === "target") {
                const rendered = renderTarget(segment);
                processed += rendered.html;
            } else {
                const r = renderSegment(segment, bestClass, activeColor);
                processed += r.html;
                activeColor = r.activeColor;
            }

            argCounter++;

            // --- THE 3 LINES FOR CHAINING ---
            if (activePatterns.length > 0 && argCounter >= activePatterns[0].length && !restOfLineMode) {
                argCounter = 0;
                // Done consuming nested pattern args — allow chain resets again
                inNestedPattern = false;
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
        const response = await fetch(`https://mcbcode.com/backend/commands/${cmd}.json`);
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
            // Validation only — rendering handled by renderTarget
            return /^(@[aeprsv](\[.*\])?|[A-Za-z0-9_]{3,16})$/i.test(word) ? "hl-selector" : "hl-error";
        case "word":
            if (expected.options) {
                if (expected.options.includes("*")) return "hl-item"; 
                if (expected.options.includes(word.toLowerCase())) return "hl-word"; 
            }
            if (expected.restOfLine === "true") return "hl-item";
            return "hl-error";
        case "item_id": 
            return /^([a-z0-9_]+:)?[a-z0-9_]+$/.test(word) ? "hl-item" : "hl-error";
            
        case "xp_amount":
            return /^-?\d+[Ll]?$/.test(word) ? "hl-number" : "hl-error";
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
