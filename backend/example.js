// Cache to store command JSONs
const commandCache = {};

/**
 * Main Entry Point
 */
async function applyHighlighting(text) {
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

    for (let i = 0; i < segments.length; i++) {
        let segment = segments[i];
        
        // Preserve whitespace
        if (segment.trim() === "") {
            processed += segment;
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

            // Highlight arguments based on the JSON pattern
            let expected = commandData.pattern[argCounter];
            let cssClass = getHighlightClass(segment, expected);
            processed += `<span class="${cssClass}">${escapeHtml(segment)}</span>`;
            argCounter++;
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
        case "word":
            if (expected.options) {
                if (expected.options.includes("*")) return "hl-item"; 
                if (expected.options.includes(word.toLowerCase())) return "hl-command"; 
            }
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
    // List of all your themes to ensure only one is active at a time
    const themes = ['default', 'neon', 'blue', 'soft', 'grayscale'];
    
    // Remove all theme classes from body
    themes.forEach(t => document.body.classList.remove(`theme-${t}`));
    
    // Add the selected theme class
    document.body.classList.add(`theme-${themeName}`);
    
    // Save selection
    localStorage.setItem('editor-theme', themeName);
}

// Initializing the theme on load
window.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('editor-theme') || 'default';
    setTheme(savedTheme);

    // Attach click listeners to your theme divs
    document.querySelectorAll('.sub-dropdown div').forEach(btn => {
        btn.addEventListener('click', function() {
            // Grabs the text (e.g., "Neon") and makes it "neon"
            const theme = this.textContent.trim().toLowerCase();
            setTheme(theme);
        });
    });
});
