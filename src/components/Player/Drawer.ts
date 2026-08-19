import * as d3 from "d3";

export interface IOptions {
  margin?: { top: number; bottom: number; left: number; right: number };
  height?: number;
  width?: number;
}

class Drawer {
  private buffer: AudioBuffer;
  private parent: HTMLElement;

  private progressRect?: d3.Selection<SVGRectElement, undefined, null, undefined>;

  private onSeek?: (percent: number) => void;

  constructor(buffer: AudioBuffer, parent: HTMLElement, onSeek?: (percent: number) => void) {
    this.buffer = buffer;
    this.parent = parent;
    this.onSeek = onSeek;
  }

  public generateWaveform(audioData: number[], options: IOptions = {}) {
    const {
      margin = { top: 0, bottom: 0, left: 0, right: 0 },
      height = this.parent.clientHeight,
      width = this.parent.clientWidth,
    } = options;

    const domain = d3.extent(audioData);


    const yScale = d3
      .scaleLinear()
      .domain([0, Number(domain[1]) || 1]) // Виправлено для безпечного парсингу D3
      .range([margin.top, height - margin.bottom]);

    const svg = d3.create("svg");

    svg
      .style("width", `${this.parent.clientWidth}px`)
      .style("height", `${this.parent.clientHeight}px`)
      .style("display", "block")
      .style("cursor", "pointer")
      .on("click", (event: MouseEvent) => {  
        if(!this.onSeek) return;

        const svgRect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();

        const clickX = event.clientX - svgRect.left;
        let percent = (clickX / svgRect.width) * 100;

        if (percent <  0) percent = 0;
        if (percent > 100) percent = 100;
        
        this.onSeek(percent);
      });

    // Створюємо обтравну маску (Clip Path)
    const defs = svg.append("defs");
    const clipPath = defs.append("clipPath").attr("id", "progress-clip");
    
    // Прямокутник маски, який ми будемо розтягувати
    this.progressRect = clipPath
      .append("rect")
      .attr("x", 0)
      .attr("y", -height / 2)
      .attr("height", height)
      .attr("width", 0); // Початкова ширина — 0


    const step = Math.floor(width / audioData.length);
    
    // Ширина стовпчика — це крок мінус місце під пробіл.
    // Math.max гарантує, що стовпчик буде не тоншим за 1 піксель.
    const barWidth = Math.max(1, Math.floor(step * 0.7)); 

    // Рахуємо, скільки пікселів залишиться пустими, і ділимо на 2, щоб центрувати хвилю
    const totalWaveWidth = step * audioData.length;
    const offsetX = Math.floor((width - totalWaveWidth) / 2);

    // 1. СІРА ХВИЛЯ (Фон)
    const gBg = svg.append("g").attr("transform", `translate(0, ${height / 2})`);
    gBg.selectAll("rect")
      .data(audioData)
      .join("rect")
      .attr("fill", "#475569") // Сірий колір
      .attr("height", (d) => yScale(d))
      .attr("width", () => barWidth)
      .attr("x", (_, i) => offsetX + (i * step))
      .attr("y", (d) => -yScale(d) / 2)
      .attr("rx", barWidth / 2)
      .attr("ry", barWidth / 2);

    // 2. ЗЕЛЕНА ХВИЛЯ (Програна частина)
    const gProgress = svg.append("g")
      .attr("transform", `translate(0, ${height / 2})`)
      .attr("clip-path", "url(#progress-clip)"); // Застосовуємо нашу маску!
      
    gProgress.selectAll("rect")
      .data(audioData)
      .join("rect")
      .attr("fill", "#03A300") // Зелений колір
      .attr("height", (d) => yScale(d))
      .attr("width", () => barWidth)
      .attr("x", (_, i) => offsetX + (i * step))
      .attr("y", (d) => -yScale(d) / 2)
      .attr("rx", barWidth / 2)
      .attr("ry", barWidth / 2);

    return svg;
  }

  public clearData() {
    const rawData = this.buffer.getChannelData(0);
    // Беремо фіксовану кількість семплів для оптимізації (як в статті, але безпечніше)
    const samples = 200; // замість buffer.sampleRate (який 44100 і може повісити браузер)
    const blockSize = Math.floor(rawData.length / samples);
    const filteredData = [];

    for (let i = 0; i < samples; i += 1) {
      const blockStart = blockSize * i;
      let sum = 0;
      for (let j = 0; j < blockSize; j += 1) {
        sum += Math.abs(rawData[blockStart + j]);
      }
      filteredData.push(sum / blockSize);
    }

    const multiplier = Math.max(...filteredData) ** -1;
    return filteredData.map((n) => n * multiplier);
  }

  public init() {
    const audioData = this.clearData();
    const node = this.generateWaveform(audioData, {});

    // Очищаємо контейнер перед додаванням нового SVG (щоб не дублювалося при зміні треку)
    this.parent.innerHTML = "";
    this.parent.appendChild(node.node() as Element);
  }

  public updateProgress(percent: number) {
    if (this.progressRect && this.parent) {
      // Переводимо відсотки у точні пікселі ширини контейнера
      const widthInPixels = (this.parent.clientWidth * percent) / 100;
      this.progressRect.attr('width', widthInPixels);
    }
  }
}

export default Drawer;
