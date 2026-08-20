import * as d3 from "d3";

export interface IOptions {
  margin?: { top: number; bottom: number; left: number; right: number };
  height?: number;
  width?: number;
}

class Drawer {
  // The decoded audio data provided by SoundDriver
  private buffer: AudioBuffer;
  
  // The DOM element (div) where the D3 SVG will be injected
  private parent: HTMLElement;

  // Reference to the SVG <rect> inside the <clipPath> used to reveal the green waveform
  private progressRect?: d3.Selection<SVGRectElement, undefined, null, undefined>;

  // Callback triggered when the user clicks the waveform to seek
  private onSeek?: (percent: number) => void;

  constructor(buffer: AudioBuffer, parent: HTMLElement, onSeek?: (percent: number) => void) {
    this.buffer = buffer;
    this.parent = parent;
    this.onSeek = onSeek;
  }

  /**
   * Core D3.js rendering logic. 
   * Creates the SVG, clip paths, and two sets of bars (background and foreground).
   */
  public generateWaveform(audioData: number[], options: IOptions = {}) {
    const {
      margin = { top: 0, bottom: 0, left: 0, right: 0 },
      height = this.parent.clientHeight,
      width = this.parent.clientWidth,
    } = options;

    // d3.extent finds the min and max values in the audioData array.
    const domain = d3.extent(audioData);

    // yScale maps the normalized audio amplitude (0 to 1) to physical SVG pixels (height).
    const yScale = d3
      .scaleLinear()
      .domain([0, Number(domain[1]) || 1]) // Fallback to 1 to prevent NaN errors on empty data
      .range([margin.top, height - margin.bottom]);

    // Create an isolated SVG node in memory (not yet attached to the DOM)
    const svg = d3.create("svg");

    svg
      .style("width", `${this.parent.clientWidth}px`)
      .style("height", `${this.parent.clientHeight}px`)
      .style("display", "block")
      .style("cursor", "pointer")
      .on("click", (event: MouseEvent) => {  
        if(!this.onSeek) return;

        // Get the actual physical coordinates of the SVG on the screen
        const svgRect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();

        // Calculate exact click position relative to the SVG's left edge
        const clickX = event.clientX - svgRect.left;
        
        // Convert physical pixels to a percentage for the SoundDriver
        let percent = (clickX / svgRect.width) * 100;

        // Clamp values to prevent out-of-bounds calculations
        if (percent <  0) percent = 0;
        if (percent > 100) percent = 100;
        
        this.onSeek(percent);
      });

    // --- CLIP PATH TRICK ---
    // A clipPath acts like a stencil. Anything inside it is visible, everything outside is hidden.
    const defs = svg.append("defs");
    const clipPath = defs.append("clipPath").attr("id", "progress-clip");
    
    // This is the dynamic "window" we will resize during playback to reveal the active green wave.
    this.progressRect = clipPath
      .append("rect")
      .attr("x", 0)
      .attr("y", -height / 2)
      .attr("height", height)
      .attr("width", 0); // Starts at 0 width (nothing is played yet)


    // Calculate layout constraints for the individual bars
    const step = Math.floor(width / audioData.length);
    
    // Bar width is slightly smaller than the step to leave a gap between bars.
    // Math.max ensures the bar is at least 1px wide even on tiny screens.
    const barWidth = Math.max(1, Math.floor(step * 0.7)); 

    // Center the entire waveform horizontally if there's leftover space
    const totalWaveWidth = step * audioData.length;
    const offsetX = Math.floor((width - totalWaveWidth) / 2);

    // 1. BASE WAVEFORM (Gray Background)
    // We shift the 'g' (group) down by height/2 so that drawing from y=0 goes outward from the middle
    const gBg = svg.append("g").attr("transform", `translate(0, ${height / 2})`);
    
    gBg.selectAll("rect")
      .data(audioData)
      .join("rect")
      .attr("fill", "#475569") // Tailwind slate-600 equivalent
      .attr("height", (d) => yScale(d))
      .attr("width", () => barWidth)
      .attr("x", (_, i) => offsetX + (i * step))
      .attr("y", (d) => -yScale(d) / 2) // Shift up by half height to center the bar vertically
      .attr("rx", barWidth / 2) // Rounded corners
      .attr("ry", barWidth / 2);

    // 2. PROGRESS WAVEFORM (Green Foreground)
    // We draw the EXACT same wave again, but in green, and hide it behind the clip-path.
    const gProgress = svg.append("g")
      .attr("transform", `translate(0, ${height / 2})`)
      .attr("clip-path", "url(#progress-clip)"); // Attach the stencil!
      
    gProgress.selectAll("rect")
      .data(audioData)
      .join("rect")
      .attr("fill", "#03A300") // Active green color
      .attr("height", (d) => yScale(d))
      .attr("width", () => barWidth)
      .attr("x", (_, i) => offsetX + (i * step))
      .attr("y", (d) => -yScale(d) / 2)
      .attr("rx", barWidth / 2)
      .attr("ry", barWidth / 2);

    return svg;
  }

  /**
   * Audio data reduction (Downsampling).
   * An AudioBuffer contains ~44,100 data points per second. Rendering millions of SVG rectangles 
   * would completely freeze the browser. This method compresses the data into 200 distinct visual bars.
   */
  public clearData() {
    // Channel 0 is the left channel (sufficient for visual representation)
    const rawData = this.buffer.getChannelData(0);
    
    // Fixed number of bars to draw regardless of track length
    const samples = 200; 
    
    // Number of audio data points grouped into a single visual bar
    const blockSize = Math.floor(rawData.length / samples);
    const filteredData = [];

    // Loop through each block and calculate the average amplitude (volume)
    for (let i = 0; i < samples; i += 1) {
      const blockStart = blockSize * i;
      let sum = 0;
      for (let j = 0; j < blockSize; j += 1) {
        // Math.abs converts negative sound waves to positive for visual block height
        sum += Math.abs(rawData[blockStart + j]);
      }
      filteredData.push(sum / blockSize);
    }

    // Normalize the data: Find the highest peak and scale everything so the max peak is exactly 1.
    // This ensures quiet songs and loud songs both fill the container's height perfectly.
    const multiplier = Math.max(...filteredData) ** -1;
    return filteredData.map((n) => n * multiplier);
  }

  /**
   * Bootstraps the drawing process and mounts the SVG into the React DOM node.
   */
  public init() {
    const audioData = this.clearData();
    const node = this.generateWaveform(audioData, {});

    // Clear any previous SVG (prevents duplicates if a new file is dragged in)
    this.parent.innerHTML = "";
    
    // Inject the freshly created raw DOM element into the parent div
    this.parent.appendChild(node.node() as Element);
  }

  /**
   * Called ~60 times per second by SoundDriver's requestAnimationFrame.
   * Modifies the width of the clip-path mask, revealing the green waveform underneath.
   */
  public updateProgress(percent: number) {
    if (this.progressRect && this.parent) {
      // Convert percentage back into absolute physical pixels based on container width
      const widthInPixels = (this.parent.clientWidth * percent) / 100;
      this.progressRect.attr('width', widthInPixels);
    }
  }
}

export default Drawer;