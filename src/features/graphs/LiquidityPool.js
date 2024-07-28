import React, { useState, useEffect } from 'react';
import Graph from './Graph';
import { Chart, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';

// Register the necessary chart components
Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const roundDecimals = 2;
const taxPercentage = 10;

const incraments = 10;

const startAmountA = 1000;
const startAmountB = 1200;

const nameA = 'EUR';
const nameB = 'USD';

const slopeEntries = 1000;

const startK = startAmountA * startAmountB;
let k = startK;
let growthK = 0;

const formatNumberSepNDec = (number) => {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: roundDecimals,
        maximumFractionDigits: roundDecimals
    }).format(number);
};

const roundToDecimals = (number) => {
    return parseFloat(number.toFixed(roundDecimals));
};

function LiquidityPool() {
    const [pool, setPool] = useState({ EUR: startAmountA, USD: startAmountB });
    const [graphData, setGraphData] = useState({
        datasets: [{
            label: 'Liquidity Pool',
            data: [{ x: startAmountB, y: startAmountA }],
            pointBackgroundColor: ['rgb(255, 99, 132)'],  // Array of colors to differentiate points
            pointRadius: [5], // Array of radii to differentiate points
            pointHoverRadius: [12],
            hoverBackgroundColor: ['rgb(54, 162, 235)'] // Array of colors for hover state
        }, {
            label: 'Constant K',
            data: [], // Initially empty, will be updated in useEffect
            borderColor: 'rgba(211, 211, 211, 0.5)',
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            showLine: true
        }]
    });

    useEffect(() => {
        if (pool.EUR !== startAmountA || pool.USD !== startAmountB) {
            const newPoint = { x: roundToDecimals(pool.USD), y: roundToDecimals(pool.EUR) };

            k = pool.EUR * pool.USD;
            growthK = (k / startK) - 1;
            
            const minUSD = Math.max(pool.USD * 0.5 - incraments * 2, incraments * Math.pow(10, -roundDecimals+1));
            const minEUR = Math.max(pool.EUR * 0.5 - incraments * 2, incraments * Math.pow(10, -roundDecimals+1));
            const maxUSD = k / minEUR;
            const slopeStep = roundToDecimals((maxUSD - minUSD) / slopeEntries);
            const newLineData = [];
            for (let x = minUSD; x <= maxUSD; x += slopeStep) {
                const y = roundToDecimals(k / x);
                x = roundToDecimals(x);
                newLineData.push({ x, y });
            }


            setGraphData(prevData => {
                const updatedData = prevData.datasets[0].data.map(point => point);
                const updatedBackgroundColors = prevData.datasets[0].pointBackgroundColor.map(() => 'rgb(255, 99, 132)'); // Reset color
                const updatedRadii = prevData.datasets[0].pointRadius.map(() => 5); // Reset radius

                updatedData.push(newPoint);
                updatedBackgroundColors.push('rgb(255, 99, 132)'); // Distinct color for the new point
                updatedRadii.push(10); // Increased radius for the new point

                return {
                    datasets: [
                        {
                            ...prevData.datasets[0],
                            data: updatedData,
                            pointBackgroundColor: updatedBackgroundColors,
                            pointRadius: updatedRadii
                        },
                        {
                            ...prevData.datasets[1],
                            data: newLineData
                        }
                    ]
                };
            });
        }
    }, [pool]);

    const options = {
        scales: {
            x: {
                type: 'linear',
                position: 'bottom',
                title: {
                    display: true,
                    text: `${nameB} in Pool`
                }
            },
            y: {
                title: {
                    display: true,
                    text: `${nameA} in Pool`
                }
            }
        },
        plugins: {
            tooltip: {
                callbacks: {
                    label: function (context) {
                        return `${nameA}: ${context.raw.y}, ${nameB}: ${context.raw.x}`;
                    }
                }
            },
            legend: {
                display: false
            }
        }
    };

    let eurNeeded = (pool.EUR * incraments) / (pool.USD - incraments) * (1 + taxPercentage / 100);
    let usdNeeded = (pool.USD * incraments) / (pool.EUR - incraments) * (1 + taxPercentage / 100);
    const buyCurrency = (currency, amount) => {
        if (currency === "USD") {
            //const eurNeeded = amount / (pool.USD / pool.EUR);

            if (pool.USD > amount + incraments) {
                setPool(prev => ({ EUR: prev.EUR + eurNeeded, USD: prev.USD - amount }));
            }
        } else {

            if (pool.EUR > amount + incraments) {
                setPool(prev => ({ EUR: prev.EUR - amount, USD: prev.USD + usdNeeded }));
            }
        }
    };

    return (
        <div className='h-5/6'>
            <Graph data={graphData} options={options} />
            <div className="flex flex-col items-center justify-center space-y-4 p-4">
                <div className="flex space-x-4">
                    <button onClick={() => buyCurrency(`${nameB}`, incraments)} className="bg-blue-500 hover:bg-blue-900 text-white font-bold py-2 px-4 rounded">Buy {formatNumberSepNDec(incraments)} {nameB} for {formatNumberSepNDec(eurNeeded)} {nameA} </button>
                    <button onClick={() => buyCurrency(`${nameA}`, incraments)} className="bg-blue-500 hover:bg-blue-900 text-white font-bold py-2 px-4 rounded">Buy {formatNumberSepNDec(incraments)} {nameA} for {formatNumberSepNDec(usdNeeded)} {nameB} </button>
                </div>
                <div className="text-center text-lg">
                    <p>Current Pool: {nameA} {formatNumberSepNDec(pool.EUR)}, {nameB} {formatNumberSepNDec(pool.USD)}</p>
                    <p>K: {formatNumberSepNDec(k)} ({roundToDecimals(growthK*100)}%)</p>
                </div>
            </div>
        </div>
    );
}

export default LiquidityPool;
