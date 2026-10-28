import * as echarts from 'echarts/core';
import { SankeyChart } from 'echarts/charts';
import { AriaComponent, GraphicComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import {
  DESTINATION_TOTALS,
  DISPLAY_DESTINATIONS,
  DISPLAY_SOURCES,
  GROUP_LABELS,
  SOURCE_TOTALS,
  pairKey,
} from './data.js';

echarts.use([SankeyChart, AriaComponent, GraphicComponent, TooltipComponent, SVGRenderer]);

const GROUP_COLORS = {
  O: '#287f70',
  FB: '#3676b7',
  L: '#d44848',
  BN: '#c78f20',
  A: '#728541',
};

const amountFormat = new Intl.NumberFormat('pt-BR');

export function drawSankey(element, values) {
  const width = Math.max(360, Math.floor(element.parentElement.clientWidth));
  const compact = width < 600;
  const height = compact ? 520 : 560;
  const left = compact ? 140 : 225;
  const right = compact ? 140 : 225;
  const labels = Object.fromEntries([
    ...DISPLAY_SOURCES.map((group) => [`source-${group}`, GROUP_LABELS[group]]),
    ...DISPLAY_DESTINATIONS.map((group) => [`destination-${group}`, GROUP_LABELS[group]]),
  ]);
  const data = [
    ...DISPLAY_SOURCES.map((group) => ({
      name: `source-${group}`,
      value: SOURCE_TOTALS[group],
      itemStyle: { color: GROUP_COLORS[group] },
      label: { position: 'left', align: 'right' },
    })),
    ...DISPLAY_DESTINATIONS.map((group) => ({
      name: `destination-${group}`,
      value: DESTINATION_TOTALS[group],
      itemStyle: { color: GROUP_COLORS[group] },
      label: { position: 'right', align: 'left' },
    })),
  ];
  const links = DISPLAY_SOURCES.flatMap((source) => DISPLAY_DESTINATIONS.map((destination) => ({
    source: `source-${source}`,
    target: `destination-${destination}`,
    value: values[pairKey(source, destination)],
    sourceGroup: source,
  })).filter((link) => link.value > 0));

  const chart = echarts.getInstanceByDom(element)
    ?? echarts.init(element, null, { renderer: 'svg' });
  chart.setOption({
    animation: false,
    aria: { enabled: true },
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        if (params.dataType === 'edge') {
          const source = labels[params.data.source];
          const destination = labels[params.data.target];
          return `${source} → ${destination}<br><strong>${amountFormat.format(params.data.value)} votos</strong>`;
        }
        const group = labels[params.name];
        const total = params.data.value;
        return `${group}<br><strong>${amountFormat.format(total)} votos</strong>`;
      },
    },
    graphic: [
      {
        type: 'text',
        left: left - 12,
        top: 14,
        style: { text: '1º TURNO', textAlign: 'right', fill: '#75827a', fontSize: 10, fontWeight: 700 },
      },
      {
        type: 'text',
        right: right - 12,
        top: 14,
        style: { text: '2º TURNO', textAlign: 'left', fill: '#75827a', fontSize: 10, fontWeight: 700 },
      },
      {
        type: 'text',
        left: 'center',
        bottom: 1,
        silent: true,
        style: {
          text: 'interactiveviz@proton.me',
          textAlign: 'center',
          fill: 'rgba(95, 111, 101, 0.42)',
          fontSize: 10,
          fontFamily: 'Avenir Next, Segoe UI, sans-serif',
        },
      },
    ],
    series: [{
      type: 'sankey',
      orient: 'horizontal',
      nodeAlign: 'justify',
      nodeWidth: compact ? 13 : 17,
      nodeGap: compact ? 18 : 20,
      layoutIterations: 32,
      draggable: false,
      left,
      right,
      top: 42,
      bottom: 20,
      data,
      links,
      label: {
        color: '#718078',
        fontFamily: 'Avenir Next, Segoe UI, sans-serif',
        fontSize: compact ? 10 : 12,
        fontWeight: 600,
        formatter: (params) => labels[params.name],
      },
      lineStyle: {
        color: 'source',
        opacity: 0.78,
        curveness: 0.48,
      },
      emphasis: { focus: 'adjacency' },
    }],
  }, true);
  chart.resize({ width, height });
}