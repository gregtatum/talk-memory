const crossroads = require('crossroads');
const hasher = require('hasher');
const startVisualization = require('./visualization')
const actions = require('./actions')

let destroyPreviousVisualization = () => {}

function parseHash (newHash, oldHash) {
  crossroads.parse(newHash);
}

crossroads.addRoute('/{name}', (name) => {
  if(!actions[name]) {
    alert("Could not find that page.")
    hasher.replaceHash('');
    return
  }
  destroyPreviousVisualization()
  destroyPreviousVisualization = startVisualization(actions[name])
});

crossroads.addRoute(/.*/, () => {
  console.log('main route')
  const container = document.querySelector('.node')
  container.innerHTML = `
    <h1 class='title-header'>Understanding Memory in JavaScript</h1>
    <p class='title-subheader'>by Greg Tatum</p>
  `

  Object.keys(actions).forEach(key => {
    const div = document.createElement('div')
    div.innerHTML = `
      <a href='#/${key}' class='title-link'>${key}</a><br/>
    `
    container.appendChild(div)
  })
  destroyPreviousVisualization()
  destroyPreviousVisualization = () => {
    const els = Array.from(document.querySelectorAll('.node > *'))
    els.forEach(el => el.remove())
  }
});

hasher.initialized.add(parseHash); // parse initial hash
hasher.changed.add(parseHash); //parse hash changes
hasher.init(); //start listening for history change
