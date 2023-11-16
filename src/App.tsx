import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import '@radix-ui/themes/styles.css';
import { Excalidraw } from '@excalidraw/excalidraw';
import { Slider } from '@radix-ui/themes';
import { Loro, LoroList, LoroMap, OpId, toReadableVersion } from 'loro-crdt';
import deepEqual from 'deep-equal';
import './App.css'
import { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types/types';

function App() {
  const excalidrawAPI = useRef<ExcalidrawImperativeAPI>();
  const versionsRef = useRef<OpId[][]>([]);
  const [maxVersion, setMaxVersion] = useState(-1);
  const [docSize, setDocSize] = useState(0);
  const [vv, setVV] = useState("")

  const { doc, docElements } = useMemo(() => {
    const doc = new Loro();
    doc.setPeerId(0n);
    const docElements = doc.getList("elements");
    doc.subscribe((e) => {
      setVV(JSON.stringify(Object.fromEntries(toReadableVersion(doc.version()))));
      if (!e.fromCheckout) {
        versionsRef.current.push(doc.frontiers())
        setMaxVersion(versionsRef.current.length - 1);
        setVersionNum(versionsRef.current.length - 1)
        setDocSize(doc.exportFrom().length);
      } else {
        excalidrawAPI.current?.updateScene({ elements: docElements.getDeepValue() })
      }
    });
    return { doc, docElements }
  }, []);

  const [versionNum, setVersionNum] = useState(-1);
  const lastVersion = useRef(-1);
  return (
    <div >
      <div style={{ width: "100%", height: "calc(100vh - 100px)" }}>
        <Excalidraw
          excalidrawAPI={api => { excalidrawAPI.current = api }}
          viewModeEnabled={versionNum !== maxVersion}
          onChange={(elements) => {
            const v = getVersion(elements);
            if (lastVersion.current === v) {
              // local change, should detect and record the diff to loro doc
              if (recordLocalOps(docElements, elements)) {
                doc.commit();
              }
              // if (!deepEqual(docElements.getDeepValue(), elements)) {
              //   console.log(docElements.getDeepValue(), elements);
              // }
            }

            lastVersion.current = v;
          }}
        />
      </div>
      <div style={{ margin: "1em 2em" }}>
        <div>
          Version Vector {vv}, Doc Size {docSize} bytes
        </div>
        <Slider value={[versionNum]} max={maxVersion} onValueChange={(v) => {
          setVersionNum(v[0]);
          if (v[0] === -1) {
            doc.checkout([]);
          } else {
            if (v[0] === versionsRef.current.length - 1) {
              doc.checkoutToLatest()
            } else {
              doc.checkout(versionsRef.current[v[0]]);
            }
          }
        }} />
      </div>
    </div>
  )
}

function recordLocalOps(loroList: LoroList, elements: readonly { version: number }[]): boolean {
  let changed = false;
  for (let i = loroList.length; i < elements.length; i++) {
    loroList.insertContainer(i, "Map");
    changed = true;
  }

  for (let i = 0; i < elements.length; i++) {
    const map = loroList.get(i) as LoroMap;
    const elem = elements[i];
    if (map.get("version") === elem.version) {
      continue;
    }

    for (const [key, value] of Object.entries(elem)) {
      const src = map.get(key);
      if ((typeof src === "object" && !deepEqual(map.get(key), value)) || src !== value) {
        changed = true;
        map.set(key, value)
      }
    }
  }

  return changed
}

function getVersion(elems: readonly { version: number }[]): number {
  return elems.reduce((acc, curr) => {
    return curr.version + acc
  }, 0)
}

export default App