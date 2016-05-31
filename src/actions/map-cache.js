exports.code = `var cache = Map();

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
  ],
  [
    // var cache = Map();
    ["addNode", {type: "object", display: "Map", id: "cache"}],
    ["addLink", {source: "window", target: "cache", display: "cache"}],
    ["highlight", 1],
  ],
  [
    // function getFancyEditor(element) { ... }
    ["highlight", [3,14]],
  ],
  [
    // var elA = document.querySelector('#comment-box');
    ["highlight", 16],
    ["addNode", {id: "elA", type: "object", "display": "< >"}],
    ["addLink", {source: "window", target: "elA", display: "elA"}],
  ],
  [
    // var elB = document.querySelector('#admin-editor');
    ["highlight", 17],
    ["addNode", {id: "elB", type: "object", "display": "< >"}],
    ["addLink", {source: "window", target: "elB", display: "elB"}],
  ],

  //------------------------------------------------------
  // Comment Box 1
  [
    // getFancyEditor(elA)
    ["highlight", ["19:19", "19:38"]],
    ["addNode", {type: "function", display: "scope", id: "scope1"}],
    ["addLink", {source: "callStack", target: "scope1", display: "getFancyEditor"}],
  ],
  [
    // getFancyEditor(element) args
    ["highlight", ["3:25", "3:32"]],
    ["addLink", {source: "scope1", target: "elA", dashed: true}],
  ],
  [
    // var fancyEditor = cache.get(element);
    ["highlight", 5],
    ["addNode", {id: "undefined1", type: "value", display: "undefined"}],
    ["addLink", {source: "scope1", target: "undefined1", display: "fancyEditor", distance: 1.5}],
  ],
  [
    // if (fancyEditor) { ... }
    ["highlight", [6,8]]
  ],
  [
    // fancyEditor = new FancyEditor(element);
    ["highlight", 11],
    ["removeNode", "undefined1"],
    ["addNode", {id: "fancyEditor1", type: "object", display: ". . .. fancyEditor", radius: 3}],
    ["addLink", {source: "scope1", target: "fancyEditor1", display: "fancyEditor", distance: 2.5}],
  ],
  [
    // cache.set(element, fancyEditor);
    ["highlight", 12],
    ["addLink", {source: "cache", target: "fancyEditor1", display: "<elA>     ", distance: 2.5}],
    ["addLink", {source: "cache", target: "elA", display: "key"}],
  ],
  [
    // return fancyEditor;
    ["highlight", 13],
  ],
  [
    // var commentBox1 = getFancyEditor(elA);
    ["highlight", 19],
    ["removeNode", "scope1"],
    ["addLink", {source: "window", target: "fancyEditor1", display: "commentBox1", distance: 2.5}],
  ],

  //------------------------------------------------------
  // Comment Box 2
  [
    // getFancyEditor(elB)
    ["highlight", ["20:19", "20:38"]],
    ["addNode", {type: "function", display: "scope", id: "scope2"}],
    ["addLink", {source: "callStack", target: "scope2", display: "getFancyEditor"}],
  ],
  [
    // getFancyEditor(element) args
    ["highlight", ["3:25", "3:32"]],
    ["addLink", {source: "scope2", target: "elA", dashed: true}],
  ],
  [
    // var fancyEditor = cache.get(element);
    ["highlight", 5],
    ["addLink", {source: "scope2", target: "fancyEditor1", display: "fancyEditor", distance: 2.5}],
  ],
  [
    // if (fancyEditor) { ... }
    ["highlight", [6,8]]
  ],
  [
    // return fancyEditor;
    ["highlight", 7]
  ],
  [
    // var commentBox1 = getFancyEditor(elA);
    ["highlight", 20],
    ["removeNode", "scope2"],
    ["renameLink", {source: "window", target: "fancyEditor1", display: "commentBox1/2", distance: 2.5}],
  ],

  //--------------------------------------------------------
  // Remaining comment boxes
  [
    // var commentBox3 = getFancyEditor(elB);
    // var commentBox4 = getFancyEditor(elB);
    ["addNode", {id: "fancyEditor2", type: "object", display: ". . .. fancyEditor", radius: 3}],
    ["addLink", {source: "cache", target: "fancyEditor2", display: "<elB>     ", distance: 2.5}],
    ["addLink", {source: "cache", target: "elB", display: "key"}],
    ["addLink", {source: "window", target: "fancyEditor2", display: "commentBox3/4", distance: 2.5}],
    ["highlight", [22, 23]],
  ],
  [
    //commentBox1/2 = undefined;
    ["removeLink", ["window", "fancyEditor1"]],
    ["highlight", [25, 26]],
  ],
  [
    // commentBox3/4 = undefined;
    ["removeLink", ["window", "fancyEditor2"]],
    ["highlight", [27, 28]],
  ],
  [
    ["removeLink", ["window", "elA"]],
    ["removeLink", ["window", "elB"]],
  ],
]
