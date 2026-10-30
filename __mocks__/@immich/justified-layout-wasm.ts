/**
 * Deterministic replacement for @immich/justified-layout-wasm used in Jest
 * (the real package loads a wasm binary, which Node tests cannot fetch).
 *
 * Packs the ratios into classic justified rows: finished rows fill the row
 * width exactly, the final row keeps its natural height, and positions are
 * absolute within the container. Good enough for exact-by-construction tests
 * and the example, never used in the shipped app.
 */
class JustifiedLayout {
  positions = [];

  constructor(aspectRatios, options) {
    const rowHeight = options.rowHeight;
    const rowWidth = options.rowWidth;
    const spacing = options.spacing || 0;

    let top = 0;
    let row = [];
    let rowRatios = [];

    const flushRow = (height) => {
      let left = 0;
      for (let k = 0; k < row.length; k++) {
        const width = height * rowRatios[k];
        this.positions[row[k]] = { left, top, width, height };
        left += width + spacing;
      }
      top += height + spacing;
      row = [];
      rowRatios = [];
    };

    const rowHeightAtScale = (ratios) => {
      const sumRatios = ratios.reduce((sum, ratio) => sum + ratio, 0);
      return (rowWidth - spacing * (ratios.length - 1)) / sumRatios;
    };

    for (let i = 0; i < aspectRatios.length; i++) {
      row.push(i);
      rowRatios.push(aspectRatios[i]);

      const totalWidth =
        rowHeight * rowRatios.reduce((sum, ratio) => sum + ratio, 0) +
        spacing * (row.length - 1);
      const exceeds = totalWidth > rowWidth;

      if (exceeds && row.length > 1) {
        // Re-flow without the last item so the finished row fills the width.
        const lastIndex = row.pop();
        const lastRatio = rowRatios.pop();
        flushRow(rowHeightAtScale(rowRatios));
        row.push(lastIndex);
        rowRatios.push(lastRatio);
      }
    }
    if (row.length > 0) {
      flushRow(rowHeight);
    }
  }

  getPosition(i) {
    const position = this.positions[i];
    if (!position) {
      throw new Error(`no position for index ${i}`);
    }
    return position;
  }
}

module.exports = { JustifiedLayout };
