const calculateL = (Pa, Pb, X_r, Y_r) => {
  const Pa_sq = Math.sqrt(Pa);
  const Pb_sq = Math.sqrt(Pb);

  const part1 = Pa * Pb * Math.pow(X_r, 2) - 2 * Pa_sq * Pb_sq * X_r * Y_r + 4 * Pb * X_r * Y_r + Math.pow(Y_r, 2);
  const part2 = Pa_sq * Pb_sq * X_r + Y_r;

  const numerator = Math.sqrt(part1) + part2;
  const denominator = 2 * Pa_sq - 2 * Pb_sq;

  const L = - numerator / denominator;
  
  return parseFloat(L);
};

L = calculateL(10, 9053.8, 226.34, 3621.52);
console.log(`L: ${L}`);