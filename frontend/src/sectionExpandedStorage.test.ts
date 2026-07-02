import { afterEach, describe, expect, it } from "vitest";

import { loadSectionExpanded, saveSectionExpanded } from "./sectionExpandedStorage";

const KEY = "plexamp-speed-dial.sectionExpanded";

describe("sectionExpandedStorage", () => {
  afterEach(() => {
    localStorage.removeItem(KEY);
  });

  it("saves and loads section expanded state", () => {
    saveSectionExpanded({ pickMusic: true, playTo: false, speedDialFilters: true });
    expect(loadSectionExpanded()).toEqual({ pickMusic: true, playTo: false, speedDialFilters: true });
  });
});
