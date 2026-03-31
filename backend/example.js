// Cache to store command JSONs
const commandCache = {};
// Cache for § color codes
const colorCodes = {};

/**
 * Main Entry Point
 */
async function applyHighlighting(text) {
    // Initial fetch for color codes if not loaded
    if (Object.keys(colorCodes).length === 0) {
        fetchColorCodes();
    }

    const lines = text.split('\n');
    let finalHtml = "";
    const errorLines = []; 

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // 1. Handle Empty Lines
        if (line.trim() === "") {
            finalHtml += "\n";
            continue;
        }

        // 2. Handle Comments
        if (line.trim().startsWith('#')) {
            finalHtml += `<span class="hl-comment">${escapeHtml(line)}</span>\n`;
            continue;
        }

        // 3. Process Command Logic
        const segments = line.split(/(\s+)/);
        const processed = processSegmentsSync(segments);
        
        // Track errors for the gutter dots
        if (processed.includes('hl-error')) {
            errorLines.push(i + 1);
        }
        
        finalHtml += processed + "\n";
    }

    // Call the dot update in the HTML if it exists
    if (typeof window.updateErrorDots === "function") {
        window.updateErrorDots(errorLines);
    }

    return finalHtml;
}

/**
 * The "Brain" - Processes segments
 */
function processSegmentsSync(segments) {
    let processed = "";
    let commandData = null;
    let argCounter = 0;
    let restOfLineMode = false;
    let restOfLineClass = "";
    
    // § Color & Formatting State
    let activeColor = null;
    let activeFormat = []; // e.g., ["font-weight:bold", "text-decoration:underline"]

    for (let i = 0; i < segments.length; i++) {
        let segment = segments[i];
        
        // Preserve whitespace
        if (segment.trim() === "") {
            processed += segment;
            continue;
        }

        // § COLOR & FORMATTING LOGIC
        if (segment.includes('§')) {
            const parts = segment.split(/(§[0-9a-f-r-l-o-n-m-k])/i);
            let colorSegmentHtml = "";
            
            for (let part of parts) {
                if (/§[0-9a-f]/i.test(part)) {
                    const code = part.charAt(1).toLowerCase();
                    activeColor = colorCodes[code] || null;
                    colorSegmentHtml += `<span class="hl-code">${part}</span>`;
                } else if (/§r/i.test(part)) {
                    activeColor = null;
                    activeFormat = [];
                    colorSegmentHtml += `<span class="hl-code">${part}</span>`;
                } else if (/§[l-o-n-m-k]/i.test(part)) {
                    const code = part.charAt(1).toLowerCase();
                    const format = colorCodes[code];
                    if (format && !activeFormat.includes(format)) activeFormat.push(format);
                    colorSegmentHtml += `<span class="hl-code">${part}</span>`;
                } else {
                    const styleStr = (activeColor ? `color: ${activeColor};` : "") + activeFormat.join(";");
                    const style = styleStr ? `style="${styleStr}"` : "";
                    colorSegmentHtml += `<span ${style}>${escapeHtml(part)}</span>`;
                    if (part.includes('"') || part.includes("'")) { activeColor = null; activeFormat = []; }
                }
            }
            processed += colorSegmentHtml;
            continue; 
        }

        const segmentLower = segment.toLowerCase();

        if (!commandData) {
            // Check cache for the base command (e.g., "give")
            commandData = commandCache[segmentLower];

            if (commandData) {
                processed += `<span class="hl-command">${escapeHtml(segment)}</span>`;
            } else {
                // Not in cache? Fetch for next time and mark as error for now
                fetchCommandGrammar(segmentLower); 
                processed += `<span class="hl-error">${escapeHtml(segment)}</span>`;
            }
        } else {
            // Handle Execute Recursion
            if (segmentLower === "run" && commandData.command === "execute") {
                processed += `<span class="hl-command">run</span>`;
                // Process the rest of the line as a new command
                processed += processSegmentsSync(segments.slice(i + 1));
                break; 
            }

            // If we hit a restOfLine trigger previously, keep using that class
            if (restOfLineMode) {
                const styleStr = (activeColor ? `color: ${activeColor};` : "") + activeFormat.join(";");
                const style = styleStr ? `style="${styleStr}"` : "";
                processed += `<span class="${restOfLineClass}" ${style}>${escapeHtml(segment)}</span>`;
                continue;
            }

            // Highlight arguments based on the JSON pattern
            let expected = commandData.pattern[argCounter];
            let cssClass = getHighlightClass(segment, expected);
            
            // Check for the new restOfLine state
            if (expected && expected.restOfLine === "true") {
                restOfLineMode = true;
                restOfLineClass = cssClass;
            }

            const styleStr = (activeColor ? `color: ${activeColor};` : "") + activeFormat.join(";");
            const style = styleStr ? `style="${styleStr}"` : "";
            processed += `<span class="${cssClass}" ${style}>${escapeHtml(segment)}</span>`;
            argCounter++;
        }
    }
    return processed;
}

/**
 * Fetchers
 */
async function fetchColorCodes() {
    try {
        const response = await fetch(`./colorcodes.json`);
        if (response.ok) {
            const data = await response.json();
            Object.assign(colorCodes, data);
        }
    } catch (e) { /* silent fail */ }
}

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
        case "word":
            if (expected.options) {
                if (expected.options.includes(word.toLowerCase())) return "hl-command"; 
            }
            if (expected.restOfLine === "true") return "hl-item";
            return "hl-error";
        case "item_id": 
            return /^([a-z0-9_]+:)?[a-z0-9_]+$/.test(word) ? "hl-item" : "hl-error";
        case "int": 
            return /^([~^]-?\d*|-?\d+)$/.test(word) ? "hl-number" : "hl-error";
        default: return "";
    }
}

function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* --- THEME SWITCHING LOGIC --- */

function setTheme(themeName) {
    const themeLink = document.getElementById('theme-link');
    if (themeLink) {
        const themeUrl = `theme/editor/${themeName.toLowerCase()}.css`;
        themeLink.href = themeUrl;
        localStorage.setItem('selected-editor-theme', themeName.toLowerCase());
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('selected-editor-theme') || 'default';
    setTheme(savedTheme);

    const themeButtons = document.querySelectorAll('.sub-dropdown div');
    themeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const themeName = btn.textContent.trim().toLowerCase();
            setTheme(themeName);
        });
    });
});
