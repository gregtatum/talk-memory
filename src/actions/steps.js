module.exports = [
  [ ["addNode", {type: "window", id: "window"}]
  ],
  [ ["addNode", {type: "array", id: "array"}],
    ["addLink", ["window", "array"]]
  ],
  [ ["addNode", {type: "value", id: "array-1"}],
    ["addNode", {type: "value", id: "array-2"}],
    ["addNode", {type: "value", id: "array-3"}],
    ["addNode", {type: "value", id: "array-4"}],
    ["addLink", ["array", "array-1"]],
    ["addLink", ["array", "array-2"]],
    ["addLink", ["array", "array-3"]],
    ["addLink", ["array", "array-4"]]
  ],
  [ ["addNode", {type: "function", id: "function"}],
    ["addLink", ["window", "function"]]
  ],
]
