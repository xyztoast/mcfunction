// script.js
import {EditorView, basicSetup} from "https://cdn.jsdelivr.net/npm/@codemirror/basic-setup@6.0.1/dist/index.js";
import {EditorState} from "https://cdn.jsdelivr.net/npm/@codemirror/state@6.0.1/dist/index.js";
import {oneDark} from "https://cdn.jsdelivr.net/npm/@codemirror/theme-one-dark@6.0.1/dist/index.js";
import {LRLanguage, LanguageSupport} from "https://cdn.jsdelivr.net/npm/@codemirror/language@6.0.0/dist/index.js";
import {completeFromList} from "https://cdn.jsdelivr.net/npm/@codemirror/autocomplete@6.0.0/dist/index.js";
import {parser} from "https://cdn.jsdelivr.net/npm/@lezer/lr@1.0.0/dist/index.js";

// ------------------------------
// 1. minimal parser placeholder
// ------------------------------
// for now, just a dummy parser so codemirror can load the language
// we will expand this later to a proper mcfunction grammar
const mcParser = parser.configure({
  props: []
});

// ------------------------------
// 2. define language + autocomplete
// ------------------------------
const mcLanguage = LRLanguage.define({
  parser: mcParser,
  languageData: { commentTokens: { line: "#" } }
});

const mcCompletion = completeFromList([
  { label: "give", type: "keyword" },
  { label: "@p", type: "selector" },
  { label: "@a", type: "selector" },
  { label: "@r", type: "selector" },
  { label: "stick", type: "item" }
]);

const mcSupport = new LanguageSupport(mcLanguage, [mcCompletion]);

// ------------------------------
// 3. initialize editor
// ------------------------------
const startDoc = `give @a stick`;

const state = EditorState.create({
  doc: startDoc,
  extensions: [
    basicSetup,
    oneDark,
    mcSupport
  ]
});

const view = new EditorView({
  state,
  parent: document.getElementById("editor")
});
