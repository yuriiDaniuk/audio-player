import * as d3 from 'd3';

export interface IOptions {
  margin?: { top: number; bottom: number; left: number; right: number };
  height?: number;
  width?: number;
  padding?: number;
}

class Drawer {
  private buffer: AudioBuffer;
  private parent: HTMLElement;

  constructor(buffer: AudioBuffer, parent: HTMLElement) {
    this.buffer = buffer;
    this.parent = parent;
  }

  private getTimeDomain() {
    const step = 30; // 30 секунд
    const steps = Math.ceil(this.buffer.duration / step);

    return [...new Array(steps)].map((_, index) => {
      const date = new Date(1970, 0, 1, 0, 0, 0, 0);
      date.setSeconds(index * step);

      let minutes = date.getMinutes().toString();
      if (minutes.length === 1) {
        minutes = `0${minutes}`;
      }

      let seconds = date.getSeconds().toString();
      if (seconds.length === 1) {
        seconds = `0${seconds}`;
      }

      return `${minutes}:${seconds}`;
    });
  }

  public generateWaveform(audioData: number[], options: IOptions = {}) {
    const {
      margin = { top: 0, bottom: 0, left: 0, right: 0 },
      height = this.parent.clientHeight,
      width = this.parent.clientWidth,
      padding = 1
    } = options;

    const domain = d3.extent(audioData);

    const xScale = d3
      .scaleLinear()
      .domain([0, audioData.length - 1])
      .range([margin.left, width - margin.right]);

    const yScale = d3
      .scaleLinear()
      .domain([0, Number(domain[1]) || 1]) // Виправлено для безпечного парсингу D3
      .range([margin.top, height - margin.bottom]);

    const svg = d3.create('svg');

    svg
      .style('width', `${this.parent.clientWidth}px`)
      .style('height', `${this.parent.clientHeight}px`)
      .style('display', 'block');

    // Малюємо сітку
    svg
      .append('g')
      .attr('stroke-width', 0.5)
      .attr('stroke', '#D6E5D6')
      .call(g =>
        g
          .append('g')
          .selectAll('line')
          .data(xScale.ticks())
          .join('line')
          .attr('x1', (d) => 0.5 + xScale(d))
          .attr('x2', (d) => 0.5 + xScale(d))
          .attr('y1', 0)
          .attr('y2', this.parent.clientHeight)
      )
      .call(g =>
        g
          .append('g')
          .selectAll('line')
          .data(yScale.ticks())
          .join('line')
          .attr('y1', (d) => yScale(d))
          .attr('y2', (d) => yScale(d))
          .attr('x1', 0)
          .attr('x2', this.parent.clientWidth)
      );

    svg
      .append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'rgba(255, 255, 255, 0)');

    const g = svg
      .append('g')
      .attr('transform', `translate(0, ${height / 2})`)
      .attr('fill', '#03A300');

    const band = (width - margin.left - margin.right) / audioData.length;

    // Малюємо саму хвилю
    g.selectAll('rect')
      .data(audioData)
      .join('rect')
      .attr('fill', '#03A300')
      .attr('height', d => yScale(d))
      .attr('width', () => band * padding)
      .attr('x', (_, i) => xScale(i))
      .attr('y', d => -yScale(d) / 2)
      .attr('rx', band / 2)
      .attr('ry', band / 2);

    const bands = this.getTimeDomain();

    const bandScale = d3
      .scaleBand()
      .domain(bands)
      .range([margin.top, this.parent.clientWidth]);

    // Додаємо вісь часу
    svg
      .append('g')
      .call(g => g.select('.domain').remove())
      .attr('stroke-width', 0)
      .style('color', '#95A17D')
      .style('font-size', '11px')
      .style('font-weight', 400)
      .call(d3.axisBottom(bandScale));

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
    return filteredData.map(n => n * multiplier);
  }

  public init() {
    const audioData = this.clearData();
    const node = this.generateWaveform(audioData, {});
    
    // Очищаємо контейнер перед додаванням нового SVG (щоб не дублювалося при зміні треку)
    this.parent.innerHTML = '';
    this.parent.appendChild(node.node() as Element);
  }
}

export default Drawer;