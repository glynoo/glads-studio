import assert from "node:assert/strict";
import test from "node:test";
import { handleModalKey } from "../src/components/modalFocus.js";

function fixture() {
  const focus = [];
  function control(name, disabled = false, visible = true, tabIndex = 0) {
    return {
      name,
      disabled,
      tabIndex,
      getClientRects: () => (visible ? [1] : []),
      focus: () => focus.push(name),
    };
  }
  const close = control("close");
  const field = control("field");
  const download = control("download-link");
  const controls = [
    close,
    field,
    download,
    control("saving", true),
    control("hidden-file", false, false),
    control("negative-tabindex", false, true, -1),
  ];
  const dialog = {
    querySelectorAll: () => controls,
    contains: (element) => controls.includes(element),
    focus: () => focus.push("dialog"),
  };
  const event = (shiftKey = false, key = "Tab") => ({
    key,
    shiftKey,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  });
  return { focus, close, field, download, dialog, event };
}

test("Tab from the last available link skips disabled and hidden controls and wraps", () => {
  const f = fixture(),
    event = f.event();
  handleModalKey(event, f.dialog, () => {}, f.download);
  assert.equal(event.prevented, true);
  assert.deepEqual(f.focus, ["close"]);
});
test("Shift-Tab from the dialog or close button stays in the dialog", () => {
  const f = fixture();
  handleModalKey(f.event(true), f.dialog, () => {}, f.dialog);
  handleModalKey(f.event(true), f.dialog, () => {}, f.close);
  assert.deepEqual(f.focus, ["download-link", "download-link"]);
});
test("normal input navigation is left to the browser", () => {
  const f = fixture(),
    event = f.event();
  handleModalKey(event, f.dialog, () => {}, f.field);
  assert.equal(event.prevented, false);
  assert.deepEqual(f.focus, []);
});
test("a dialog with no available controls retains focus", () => {
  const f = fixture();
  f.dialog.querySelectorAll = () => [];
  const event = f.event();
  handleModalKey(event, f.dialog, () => {}, f.dialog);
  assert.equal(event.prevented, true);
  assert.deepEqual(f.focus, ["dialog"]);
});
test("Escape invokes the supplied close action and prevents browser defaults", () => {
  const f = fixture(),
    event = f.event(false, "Escape");
  let closed = 0;
  handleModalKey(event, f.dialog, () => closed++, f.field);
  assert.equal(closed, 1);
  assert.equal(event.prevented, true);
});
