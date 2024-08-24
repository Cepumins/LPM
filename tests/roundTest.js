const taxP = 0.01;
const recievedAfterTaxP = 1 - taxP;
const minTax = 0.01;

// Import the readline module for taking input from the console
const readline = require('readline');

// Set up the readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Function to ask for the amount and calculate after tax
const askForAmount = () => {
    rl.question('Please enter the amount: ', (amount) => {
        // Convert the input to a float and round it to 2 decimal places using toFixed
        const taxAmount = parseFloat((Math.max(amount * taxP, minTax)).toFixed(2))
        const notRoundedAmount = amount - taxAmount;
        const roundedAmount = parseFloat(notRoundedAmount).toFixed(2);

        // Print the rounded amount to the console
        console.log(`The tax is: ${taxAmount} and without rounding it would be: ${notRoundedAmount}`);
        console.log(`The rounded amount after tax is: $${roundedAmount}`);
        
        // Call the function again to ask for another amount
        askForAmount();
    });
};

// Start the loop
askForAmount();
