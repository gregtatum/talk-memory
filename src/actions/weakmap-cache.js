exports.code = `var cache = WeakMap();

function getFancyEditor(element) {
  // Check if in cache already.
  var fancyEditor = cache.get(element);
  if (fancyEditor) {
    return fancyEditor;
  }

  // Not in cache, create a new one.
  fancyEditor = new FancyEditor(element);
  cache.set(element, fancyEditor);
  return fancyEditor;
}

var elA = document.querySelector('#comment-box');
var elB = document.querySelector('#admin-editor');

var commentBox1 = getFancyEditor(elA);
var commentBox2 = getFancyEditor(elA);

var commentBox3 = getFancyEditor(elB);
var commentBox4 = getFancyEditor(elB);

commentBox1 = undefined;
commentBox2 = undefined;
commentBox3 = undefined;
commentBox4 = undefined;

elA.remove();
elA = undefined;
elB.remove();
elB = undefined;
`

exports.steps = [
  [
    ["addNode", {type: "window", id: "window"}],
    ["addNode", {type: "callStack", id: "callStack"}],
  // ],
  // [
    // var cache = WeakMap();
    ["addNode", {type: "Map", display: "WeakMap", id: "cache"}],
    ["addLink", {source: "window", target: "cache", display: "cache"}],
    ["highlight", 1],
  ],
  [
    // Function declaration and els
    ["highlight", [3,17]],
    ["addNode", {id: "elA", type: "object", "display": "< >"}],
    ["addNode", {id: "elB", type: "object", "display": "< >"}],
    ["addLink", {source: "window", target: "elA", display: "elA"}],
    ["addLink", {source: "window", target: "elB", display: "elB"}],
  ],

  //------------------------------------------------------
  // Comment Box 1
  [
    // var commentBox1 = getFancyEditor(elA);
    // var commentBox2 = getFancyEditor(elA);
    ["addNode", {id: "fancyEditor1", type: "object", display: ". . .. fancyEditor", radius: 3}],
    ["addLink", {source: "cache", target: "fancyEditor1", display: "<elA>     ", distance: 2.5, dashed: true}],
    ["addLink", {source: "cache", target: "elA", display: "key", dashed: true}],
    ["addLink", {source: "window", target: "fancyEditor1", display: "commentBox1/2", distance: 2.5}],
    ["highlight", [19, 20]],
  ],

  //--------------------------------------------------------
  // Comment Box 2
  [
    // var commentBox3 = getFancyEditor(elB);
    // var commentBox4 = getFancyEditor(elB);
    ["addNode", {id: "fancyEditor2", type: "object", display: ". . .. fancyEditor", radius: 3}],
    ["addLink", {source: "cache", target: "fancyEditor2", display: "<elB>     ", distance: 2.5, dashed: true}],
    ["addLink", {source: "cache", target: "elB", display: "key", dashed: true}],
    ["addLink", {source: "window", target: "fancyEditor2", display: "commentBox3/4", distance: 2.5}],
    ["highlight", [22, 23]],
  ],
  [
    ["removeLink", ["window", "fancyEditor1"]],
    ["highlight", [25, 26]],
  ],
  [
    ["removeLink", ["window", "fancyEditor2"]],
    ["highlight", [27, 28]],
  ],
  [
    ["removeLink", ["window", "elA"]],
    ["removeLink", ["window", "elB"]],
    ["highlight", [30, 33]],
  ],
  [
    ["removeNode", "fancyEditor1"],
  ],
  [
    ["removeNode", "elA"],
  ],
  [
    ["removeNode", "fancyEditor2"],
  ],
  [
    ["removeNode", "elB"],
  ],
]
