import React, { useEffect, useState } from 'react';
import { Scatter } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import axios from 'axios';

// Register necessary Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const decimals = 2;

const options = {
  scales: {
    x: {
      type: 'linear',
      position: 'bottom',
      title: {
        display: true,
        text: 'Shares in LP'
      }
    },
    y: {
      title: {
        display: true,
        text: 'USD in LP'
      }
    }
  },
  plugins: {
    legend: {
      labels: {
        filter: function (legendItem, data) {
          // Exclude datasets without labels (empty string)
          return legendItem.text !== '';
        }
      }
    },
    tooltip: {
      callbacks: {
        label: function(context) {
          return `USD: ${context.raw.y}, Shares: ${context.raw.x}`;
        }
      }
    }
  }
};

const computeLinePoints = (x, y, numPoints, decimals = 2) => {
  const k = x * y;
  const points = [];

  for (let i = -numPoints; i <= numPoints; i++) {
    const pointX = x + i;
    if (pointX >= 1) {
      const pointY = k / pointX;
      points.push({ 
        x: parseFloat(pointX.toFixed(decimals)), 
        y: parseFloat(pointY.toFixed(decimals)) 
      });
    }
  }

  return points;
};

const fetchAndUpdateGraphData = async (ticker, setGraphData, setStockData) => {
  try {
    const response = await axios.get('http://localhost:5001/api/stocks/data');
    const stocks = response.data;
    const stock = stocks.find(s => s.ticker === ticker);
    if (stock) {
      const x = parseFloat(stock.x);
      const y = parseFloat(stock.y);
      const Pa = parseFloat(stock.Pa);
      const Pb = parseFloat(stock.Pb);
      const L = parseFloat(stock.L);
      const virtualX = L / Math.sqrt(Pb);
      const virtualY = L * Math.sqrt(Pa);
      const totalX = parseFloat((x + virtualX).toFixed(decimals));
      const totalY = parseFloat((y + virtualY).toFixed(decimals));
      const virtualPoint = { x: parseFloat(totalX), y: parseFloat(totalY) };
      const realPoint = { x: parseFloat(x), y: parseFloat(y) };
      const linePoints = 20;
      const minX = Math.max(1, totalX - linePoints)
      const maxX = totalX + linePoints;
      const virtualLine = computeLinePoints(totalX, totalY, linePoints);
      const realLine = computeLinePoints(x, y, linePoints);

      setGraphData({
        datasets: [
          {
            label: '', // Set to empty string to avoid 'undefined' labels
            data: realLine,
            backgroundColor: 'rgba(155,155,155,0.4)',
            borderColor: 'rgba(155,155,155,1)',
            pointRadius: 0,
            showLine: true,
          },
          {
            label: `${stock.ticker} (Real)`,
            data: [realPoint],
            backgroundColor: 'rgba(155,155,155,0.4)',
            borderColor: 'rgba(155,155,155,1)',
            pointRadius: 5,
            showLine: false,
          },
          {
            label: '', // Set to empty string to avoid 'undefined' labels
            data: virtualLine,
            backgroundColor: 'rgba(75,192,192,0.4)',
            borderColor: 'rgba(75,192,192,1)',
            pointRadius: 0,
            showLine: true,
          },
          {
            label: `${stock.ticker} (Virtual)`,
            data: [virtualPoint],
            backgroundColor: 'rgba(75,192,192,0.4)',
            borderColor: 'rgba(75,192,192,1)',
            pointRadius: 4,
            showLine: false,
          }
        ]
      });

      // Set stock data
      setStockData({
        x: stock.x,
        y: stock.y,
        L: stock.L
      });
    }
  } catch (error) {
    console.error('Error fetching stock data:', error);
  }
};

const Graph = ({ ticker }) => {
  const [graphData, setGraphData] = useState({
    datasets: [] // Initialize datasets to avoid undefined errors
  });
  const [stockData, setStockData] = useState({ x: 0, y: 0, L: 0 });

  useEffect(() => {
    const fetchData = () => fetchAndUpdateGraphData(ticker, setGraphData, setStockData);
    fetchData();

    const ws = new WebSocket('ws://localhost:5001');
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'update') {
        const updatedStock = message.data;
        if (updatedStock && updatedStock.ticker === ticker) {
          fetchAndUpdateGraphData(ticker, setGraphData, setStockData);
        }
      }
    };

    return () => {
      ws.close();
    };
  }, [ticker]);

  return (
    <div>
      <Scatter data={graphData} options={options} />
      <div>X: {stockData.x}</div>
      <div>Y: {stockData.y}</div>
      <div>L: {stockData.L}</div>
    </div>  
  );
};

export default Graph;
