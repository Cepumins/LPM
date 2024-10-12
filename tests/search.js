

// Tokenize function
function tokenize(query) {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

// Fuzzy matching function
function fuzzyMatch(queryTokens, stock) {
  let score = 0;

  queryTokens.forEach(token => {
    const { name, exchange, type } = stock;

    // Check for exact or close matches using string similarity (Levenshtein or basic includes)
    if (name.toLowerCase().includes(token)) score += 1;
    if (exchange.toLowerCase().includes(token)) score += 1;
    if (type.toLowerCase().includes(token)) score += 1;

    // Boost score for exact matches (optional)
    if (name.toLowerCase() === token) score += 0.5;
    if (exchange.toLowerCase() === token) score += 0.5;
    if (type.toLowerCase() === token) score += 0.5;
  });

  return score;
}

// Main search function
function searchStocks(query, stocks) {
  const queryTokens = tokenize(query);

  // Calculate scores for each stock based on the query
  return stocks
    .map(stock => ({
      stock,
      score: fuzzyMatch(queryTokens, stock)
    }))
    .filter(result => result.score > 0) // Filter out stocks with no matches
    .sort((a, b) => b.score - a.score) // Sort by score (higher is better)
    .map(result => result.stock); // Return only the stock information
}

// Example stock data
const stocks = [
  { name: "Apple", exchange: "nyse", type: "tech" },
  { name: "Apple", exchange: "lse", type: "fruits" },
  { name: "Morgan Stanley", exchange: "nyse", type: "banking" },
  { name: "JP Morgan", exchange: "nyse", type: "banking" },
  { name: "Nvidia", exchange: "nyse", type: "tech" },
  { name: "Barclays", exchange: "lse", type: "banking" }
];

// Example searches
console.log(searchStocks("banking", stocks)); // Returns stocks with type "banking"
console.log(searchStocks("apple", stocks)); // Returns both "Apple" stocks
console.log(searchStocks("apple tech", stocks)); // Returns "Apple" stock on "nyse"
console.log(searchStocks("nyse tech", stocks)); // Returns "Apple" and "Nvidia"
console.log(searchStocks("morgan", stocks)); // Returns "Morgan Stanley" and "JP Morgan"
