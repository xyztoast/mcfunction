  import { EditorView, basicSetup } from "https://cdn.jsdelivr.net/npm/@codemirror/basic-setup@6.0.1/dist/index.js";
  import { EditorState } from "https://cdn.jsdelivr.net/npm/@codemirror/state@6.0.1/dist/index.js";
  import { oneDark } from "https://cdn.jsdelivr.net/npm/@codemirror/theme-one-dark@6.0.1/dist/index.js";

  const startDoc = `give @a stick`;

  const state = EditorState.create({
    doc: startDoc,
    extensions: [
      basicSetup,
      oneDark,
      EditorView.lineWrapping
    ]
  });

  const view = new EditorView({
    state,
    parent: document.getElementById("editor")
  });
