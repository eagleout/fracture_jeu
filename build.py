import pathlib, sys
src = pathlib.Path(__file__).parent / 'src'
html = (src / 'index.html').read_text()
css = (src / 'style.css').read_text()
js = '\n'.join((src / f).read_text() for f in ['engine.js', 'world.js', 'game.js', 'render.js', 'net.js', 'ui.js', 'main.js'])
js = js.replace("'use strict';\n", '')
out = html.replace('/*CSS*/', css).replace('/*JS*/', "'use strict';\n" + js)
dist = pathlib.Path(__file__).parent / 'dist'; dist.mkdir(exist_ok=True)
(dist / 'index.html').write_text(out)
print('ok', len(out))
