// Graph.js
import React from 'react';
import { Scatter } from 'react-chartjs-2';

const options = {
  scales: {
    x: {
      type: 'linear',
      position: 'bottom',
      title: {
        display: true,
        text: 'USD in Pool'
      }
    },
    y: {
      title: {
        display: true,
        text: 'EUR in Pool'
      }
    }
  },
  plugins: {
    tooltip: {
      callbacks: {
        label: function(context) {
          return `EUR: ${context.raw.y}, USD: ${context.raw.x}`;
        }
      }
    }
  }
};

const Graph = ({ data }) => (
  <Scatter data={data} options={options} />
);

export default Graph;
