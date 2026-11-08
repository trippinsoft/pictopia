const test=require('node:test');
const assert=require('node:assert/strict');
const {makeLoader}=require('./loader.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function recapHarness(reader=()=>Promise.resolve(true)) {
  const state=[],actions=[],announcements=[];let cursor=0,focus;
  const animation={duration(){return this},reduceMotion(){return this}};
  const react={useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],value=>{state[i]=value}]},
    useRef(initial){const i=cursor++;return state[i]??={current:initial}},useCallback:fn=>fn};
  const load=makeLoader({react,'react-native':{View:'View',Pressable:'Button',AccessibilityInfo:{isScreenReaderEnabled:reader,announceForAccessibility:line=>announcements.push(line)}},
    'expo-router':{router:{push:path=>actions.push(path)},useFocusEffect:fn=>{focus=fn}},
    'react-native-reanimated':{__esModule:true,default:{View:'AnimatedView'},FadeInDown:animation,ReduceMotion:{System:'system'}},
    '@/components/ui/text':{Text:'Text'},'@/lib/icons/LucideIcon':{__esModule:true,default:'Icon'},
    './badge-art':{BadgeArt:'Badge'},'@/theming/ThemeProvider':{useTheme:()=>({theme:{colors:{tint:'blue'}}})},
  });
  const module=load('components/pictopia/recap.tsx');
  return {...module,actions,announcements,render(){cursor=0;return module.RecapHost()},focus(){return focus()}};
}
function find(node,predicate){if(!node||typeof node!=='object')return;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found}}

test('review recap occupies normal document flow, dismisses, and preserves the queue action',async()=>{
  const h=recapHarness();h.render();const blur=h.focus();
  try {
    h.showRecap({viewed:15,marked:6,streakDay:1});let tree=h.render();
    assert.doesNotMatch(tree.props.className,/absolute|z-50/);assert.equal(tree.props.style,undefined,'no bottom offset over Home content');
    const card=find(tree,n=>n.type==='AnimatedView');
    assert.equal(card.props.children.type,'View');assert.match(card.props.children.props.className,/bg-card/,'opaque recap styling stays on a regular view');
    assert.equal(card.props.exiting,undefined,'dismissed cards cannot linger over shifted content');
    assert.match(JSON.stringify(tree),/Nice exploring!/);assert.match(JSON.stringify(tree),/Review 6 marked/);
    assert.match(h.announcements[0],/15 photos explored/);
    find(tree,n=>n.props?.accessibilityLabel==='Dismiss').props.onPress();assert.equal(h.render(),null);
    h.showRecap({viewed:20,marked:2});tree=h.render();
    find(tree,n=>n.type==='Button'&&JSON.stringify(n.props.children).includes('Review 2 marked')).props.onPress();
    assert.deepEqual(h.actions,['/queue']);assert.equal(h.render(),null);await tick();
  } finally {blur()}
});

test('recap waits for a focused destination and does not replay a dismissed visit after navigation',async()=>{
  const h=recapHarness();h.showRecap({viewed:22,marked:0});assert.equal(h.render(),null);
  let blur=h.focus();assert.ok(h.render());await tick();blur();assert.equal(h.render(),null);
  h.render();blur=h.focus();assert.equal(h.render(),null);blur();
  h.showRecap({viewed:23,marked:1});h.render();blur=h.focus();assert.match(JSON.stringify(h.render()),/23 photos explored/);blur();
});
