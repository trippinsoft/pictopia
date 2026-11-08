const test = require('node:test');
const assert = require('node:assert/strict');
const { makeLoader } = require('./loader.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('Yearbook picker starts the selected year and resumes a saved snapshot without regenerating it',async()=>{
  const state=[], opened=[],chosen=[],pushed=[];
  let cursor=0,focus,fail=false;
  const saved={adventure:{id:'legacy-2017',kind:'year',source:'year:2017'},session:{ids:['a','b'],activeId:'b',records:{a:{encountered:true}},history:[]}};
  const react={
    useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],value=>{state[i]=value}];},
    useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i];},
    useMemo:fn=>fn(),useCallback:fn=>fn,
  };
  const store={choices:async()=>({years:['2023','2017','2023'],yearPhotos:{2023:2,2017:32}}),yearbooks:async()=>[saved],
    get:async()=>saved.adventure,
    choose:async choice=>{chosen.push(choice);if(fail)throw Error('write failed');return{id:choice.year==='2017'?'legacy-2017':'new-2023'};},
    open:async id=>{opened.push(id)},
  };
  const Page=makeLoader({react,'react-native':{FlatList:'List',Platform:{OS:'web'},View:'View'},
    'react-native-safe-area-context':{SafeAreaView:'Safe'},
    'expo-router':{router:{push:path=>pushed.push(path)},useFocusEffect:fn=>{focus=fn}},
    '@/components/pictopia/art-list':{ArtRow:'Row',ScreenHeader:'Header'},
    '@/components/pictopia/ui':{Button:'Button',Loading:'Loading',Text:'Text'},
    '@/services/adventures':{adventureStore:store},
  })('app/time-machine.tsx').default;
  const render=()=>{cursor=0;return Page()};
  const find=(node,type)=>{
    if(!node||typeof node!=='object')return;
    if(node.type===type)return node;
    for(const child of [node.props?.children].flat(Infinity)){const found=find(child,type);if(found)return found;}
  };
  let tree=render();assert.ok(find(tree,'Loading'));focus();await tick();tree=render();
  const list=find(tree,'List');assert.equal(list.props.data.length,2,'one row per year, even if year input repeats');
  assert.equal(list.props.ListHeaderComponent,undefined,'no separate Continue cards above the year rows');
  assert.equal(list.props.data[1].title,'2017');
  assert.match(list.props.data[0].detail,/2 photos/);
  const tap=async item=>{const row=list.props.renderItem({item}).props.children;row.props.onPress();await tick();};
  await tap(list.props.data[0]);
  assert.deepEqual(chosen,[{kind:'year',year:'2023'}]);
  assert.deepEqual(opened,['new-2023']);assert.equal(pushed[0].params.adventure,'new-2023');
  render();await tap(list.props.data[1]);
  assert.equal(chosen.length,2,'selection always goes through the canonical per-year store');
  assert.match(list.props.data[1].detail,/Continue · 2 of 2/);
  assert.equal(opened[1],'legacy-2017');assert.equal(pushed[1].params.adventure,'legacy-2017');
  render();fail=true;await tap(list.props.data[1]);
  assert.equal(pushed.length,2,'a failed save never navigates to an incomplete adventure');
  tree=render();assert.match(JSON.stringify(tree),/couldn’t be prepared/);
});
