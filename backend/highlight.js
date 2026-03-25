hljs.registerLanguage("mcfunction", function(hljs) {
  return {
    name: "mcfunction",
contains: [

    keywords: {
      keyword:
        "say tp give clear kill effect execute summon setblock fill clone teleport time weather scoreboard function tag gamemode difficulty gamerule title tellraw playsound particle"
    },
  // commands only at start of line
  {
    className: "keyword",
    begin: /^(give|tp|say|execute|summon|fill|clone|setblock|function|scoreboard|title|tellraw|playsound|particle)\b/
  },

    contains: [
  // comments
  {
    className: "comment",
    begin: /#/,
    end: /$/
  },

      {
        className: "comment",
        begin: /#/,
        end: /$/
      },
  // strings
  {
    className: "string",
    begin: /"/,
    end: /"/
  },

      {
        className: "string",
        begin: /"/,
        end: /"/
      },
  // selectors
  {
    className: "selector",
    begin: /@[pare]\b/
  },

      {
        className: "selector",
        begin: /@[pare]\b/
      },
  // coordinates
  {
    className: "number",
    begin: /(~-?\d*\.?\d+|\^-?\d*\.?\d+)/
  }

      {
        className: "number",
        begin: /(~-?\\d*\\.?\\d+|\\^-?\\d*\\.?\\d+)/
      }

    ]
  };
});
]
