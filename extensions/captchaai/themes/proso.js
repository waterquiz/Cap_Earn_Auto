window.alert = function (message) {
    console.log("Blocked alert: " + message);
};

window.addEventListener("message", async (event) => {
  if (event.data && event.data.type === "CAPSONIC_CLICK_PROSOPO_TILES") {
    const answers = event.data.answers;
    console.log("[Main World Proso] 🎯 Received tile click command with answers:", answers);

    const captchaElement = document.querySelector("prosopo-procaptcha, .prosopo-checkbox");
    const shadowRoot = captchaElement?.shadowRoot || 
                       captchaElement?.querySelector(".prosopo-checkbox")?.shadowRoot ||
                       document.querySelector(".prosopo-checkbox")?.shadowRoot;

    const modalOpen = document.querySelector(".prosopo-modalOuter") || 
                      (shadowRoot && shadowRoot.querySelector(".prosopo-modalOuter"));

    const rawImages = [
      ...(modalOpen ? Array.from(modalOpen.querySelectorAll("img")) : []),
      ...(shadowRoot ? Array.from(shadowRoot.querySelectorAll("img")) : []),
      ...Array.from(document.querySelectorAll(".prosopo-modalOuter img, prosopo-procaptcha img, img"))
    ];

    const gridImages = [];
    const seen = new Set();
    for (const img of rawImages) {
      if (img && img.src && !seen.has(img.src)) {
        seen.add(img.src);
        gridImages.push(img);
      }
    }

    console.log(`[Main World Proso] 🖼️ Discovered ${gridImages.length} grid images.`, gridImages);

    for (let i = 0; i < gridImages.length && i < answers.length; i++) {
      const img = gridImages[i];
      const shouldClick = answers[i];

      if (shouldClick) {
        console.log(`[Main World Proso] 🟢 Clicking tile #${i + 1} (Answer: true)...`, img);

        const tileContainer = img.closest("div[style*='cursor: pointer'], div[style*='cursor:pointer']") || img.parentElement || img;

        const rect = tileContainer.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        const opts = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button: 0, buttons: 1 };
        const clickEvt = new MouseEvent("click", { ...opts, buttons: 0 });

        let curr = tileContainer;
        let depth = 0;
        while (curr && curr !== modalOpen && curr !== shadowRoot && curr !== document.body && depth < 6) {
          const propsKey = Object.keys(curr).find(k => k.startsWith("__reactProps") || k.startsWith("__reactEventHandlers"));
          if (propsKey && curr[propsKey]) {
            const props = curr[propsKey];
            const synth = { nativeEvent: clickEvt, target: img, currentTarget: curr, bubbles: true, cancelable: true, isTrusted: true, type: "click" };
            if (typeof props.onClick === "function") try { props.onClick(synth); } catch (e) {}
            if (typeof props.onPointerDown === "function") try { props.onPointerDown(synth); } catch (e) {}
          }
          curr = curr.parentElement;
          depth++;
        }

        tileContainer.dispatchEvent(new PointerEvent("pointerdown", opts));
        tileContainer.dispatchEvent(new MouseEvent("mousedown", opts));
        tileContainer.dispatchEvent(new PointerEvent("pointerup", { ...opts, buttons: 0 }));
        tileContainer.dispatchEvent(new MouseEvent("mouseup", { ...opts, buttons: 0 }));
        tileContainer.dispatchEvent(clickEvt);
        if (typeof tileContainer.click === "function") tileContainer.click();

        await new Promise(r => setTimeout(r, 500));
      }
    }

    console.log("[Main World Proso] ✅ Finished clicking tiles. Waiting for state update...");
    await new Promise(r => setTimeout(r, 600));

    // Locate and click Next / Submit / Verify button in Main World
    function findActionBtn() {
      const searchScopes = [modalOpen, shadowRoot, document];
      for (const scope of searchScopes) {
        if (!scope) continue;
        const btn = scope.querySelector("button[aria-label='Next'], button[aria-label='Submit'], button[aria-label='Verify']") ||
                    Array.from(scope.querySelectorAll("button")).find(b => {
                      const text = b.textContent?.trim().toLowerCase();
                      return text === "next" || text === "submit" || text === "verify";
                    });
        if (btn) return btn;
      }
      return null;
    }

    const actionBtn = findActionBtn();
    if (actionBtn) {
      console.log("[Main World Proso] ➡️ Clicking Next/Submit button in Main World:", actionBtn);

      const opts = { bubbles: true, cancelable: true, composed: true, view: window };
      const clickEvt = new MouseEvent("click", { ...opts, buttons: 0 });

      let curr = actionBtn;
      let depth = 0;
      while (curr && curr !== modalOpen && curr !== shadowRoot && curr !== document.body && depth < 4) {
        const propsKey = Object.keys(curr).find(k => k.startsWith("__reactProps") || k.startsWith("__reactEventHandlers"));
        if (propsKey && curr[propsKey]) {
          const props = curr[propsKey];
          const synth = { nativeEvent: clickEvt, target: actionBtn, currentTarget: curr, bubbles: true, cancelable: true, isTrusted: true, type: "click" };
          if (typeof props.onClick === "function") try { props.onClick(synth); } catch (e) {}
        }
        curr = curr.parentElement;
        depth++;
      }

      actionBtn.dispatchEvent(new PointerEvent("pointerdown", opts));
      actionBtn.dispatchEvent(new MouseEvent("mousedown", opts));
      actionBtn.dispatchEvent(new PointerEvent("pointerup", { ...opts, buttons: 0 }));
      actionBtn.dispatchEvent(new MouseEvent("mouseup", { ...opts, buttons: 0 }));
      actionBtn.dispatchEvent(clickEvt);
      if (typeof actionBtn.click === "function") actionBtn.click();
    } else {
      console.warn("[Main World Proso] ⚠️ Next/Submit button not found in Main World.");
    }

    window.postMessage({ type: "CAPSONIC_PROSOPO_TILES_CLICKED" }, "*");
  }
});