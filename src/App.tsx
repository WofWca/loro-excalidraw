import { /* useEffect, */ useMemo, useRef, useState } from 'react'
import '@radix-ui/themes/styles.css';
import { Excalidraw } from '@excalidraw/excalidraw';
import { Slider } from '@radix-ui/themes';
import { Loro, LoroList, LoroMap, OpId, toReadableVersion } from 'loro-crdt';
import deepEqual from 'deep-equal';
import './App.css'
import { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types/types';
// Yeah, we only need the lib for the types.
// @ts-expect-error Why won't you accept JSDoc??
import { serializeUpdate, deserializeUpdate } from 'webxdc-yjs-provider';
import "webxdc-types/global";

// TODO fix: some scripts and assets are failing to load, because by default
// they're loaded from a 3rd party server:
// https://docs.excalidraw.com/docs/@excalidraw/excalidraw/installation#static-assets
// However, the board seems to work fine without them.
// Need to include them in the build, or get rid of them.

function App() {
  const excalidrawAPI = useRef<ExcalidrawImperativeAPI>();
  const versionsRef = useRef<OpId[][]>([]);
  const [maxVersion, setMaxVersion] = useState(-1);
  const [docSize, setDocSize] = useState(0);
  const [vv, setVV] = useState("")

  const { doc, docElements } = useMemo(() => {
    const doc = new Loro();
    const snapshotFromLocalStorage = localStorage.getItem("store");
    const lastUpdateSavedToLocalStorage = parseInt(
      localStorage.getItem("lastUpdateSavedToLocalStorage") ?? "0"
    );
    const docElements = doc.getList("elements");
    let lastSentVersion: Uint8Array | undefined = undefined;

    doc.subscribe((e) => {
      const version = Object.fromEntries(toReadableVersion(doc.version()));
      let vv = ""
      for (const [k, v] of Object.entries(version)) {
        vv += `${k.toString().slice(0, 4)}:${v} `
      }

      setVV(vv);
      if (e.local && !e.fromCheckout) {
        const bytes = doc.exportFrom(lastSentVersion);
        lastSentVersion = doc.version();
        window.webxdc.sendUpdate({
          payload: { serializedLoroUpdate: serializeUpdate(bytes) }
        }, '');
      }
      if (!e.fromCheckout) {
        versionsRef.current.push(doc.frontiers())
        setMaxVersion(versionsRef.current.length - 1);
        setVersionNum(versionsRef.current.length - 1)
        const data = doc.exportFrom();
        localStorage.setItem("store", btoa(String.fromCharCode(...data)));
        setDocSize(data.length);
      }
      if (e.fromCheckout || !e.local) {
        excalidrawAPI.current?.updateScene({ elements: docElements.getDeepValue() })
      }
    });

    const handledStoredUpdatesP = window.webxdc.setUpdateListener((update) => {
      // TODO perf: the original example app doesn't handle its own updates.
      doc.import(
        deserializeUpdate(update.payload.serializedLoroUpdate)
      );

      // TODO fix: but the update actually gets saved only inside of
      // `doc.subscribe()`. Maybe it can so happen that this does get
      // executed, but we haven't actually handled the update.
      localStorage.setItem(
        "lastUpdateSavedToLocalStorage",
        update.serial.toFixed(0)
      );
    }, lastUpdateSavedToLocalStorage);

    Promise.all([
      handledStoredUpdatesP,
      (async () => {
        if (snapshotFromLocalStorage && snapshotFromLocalStorage?.length > 0) {
          const bytes = new Uint8Array(atob(snapshotFromLocalStorage).split("").map(function (c) { return c.charCodeAt(0) }));
          doc.checkoutToLatest();
          doc.import(bytes);
        }
      })(),
      // Wait for the UI to initialize
      new Promise<void>(r => setTimeout(r, 100)),
    ])
      .then(() => {
        setMaxVersion(versionsRef.current.length - 1);
        setVersionNum(versionsRef.current.length - 1);

        excalidrawAPI.current?.updateScene({ elements: docElements.getDeepValue() })
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
        <div style={{ fontSize: "0.8em" }}>
          <button onClick={() => {
            localStorage.clear();
            location.reload();
          }}>Clear</button> Version Vector {vv}, Doc Size {docSize} bytes
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
