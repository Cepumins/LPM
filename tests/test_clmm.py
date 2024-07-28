import math
import sympy as sp

X_token = 'EUR'
Y_token = 'USD'

# Real reserves
X_r = 1000
P_r = 1.25
Y_r = X_r * P_r
#Y_r = 1200
print(f'Real reserves of X {X_token}: {X_r}')
print(f'Real reserves of Y {Y_token}: {Y_r}')

P = Y_r / X_r
print(f'Current price of {X_token} in {Y_token}: {P}')

# Price range
#P_a = exch * 0.8  # min price (20% higher than the current price)
#P_b = exch * 1.2  # max price (20% lower than the current price)
P_a = 1.2
P_b = 1.3

Pa = math.sqrt(P_a)
Pb = math.sqrt(P_b)



def calculate_L(X_r, Y_r, Pa, Pb):
    # Define the symbols
    L = sp.symbols('L')
    #A = sp.sqrt(P_b)  # sqrt(Pb)
    #B = sp.sqrt(P_a)  # sqrt(Pa)

    # Define the equation
    equation = sp.sqrt((X_r + L / Pa) * (Y_r + L * Pb)) - L

    # Solve for L
    solutions = sp.solve(equation, L)
    print(solutions)
    # Filter out the negative solutions
    positive_solutions = [sol for sol in solutions if sol > 0]

    if not positive_solutions:
        raise ValueError("No positive solutions found for L.")

    L_solution = max(positive_solutions)  # Choose the relevant solution

    # Evaluate the solution
    L_value = L_solution.evalf()
    return L_value

round_digits = 2



# Calculate L using the provided formula
L = calculate_L(X_r, Y_r, Pa, Pb)
print(f"L: {round(L, round_digits)}")

# Calculate virtual reserves
X_v = L / Pa
Y_v = L * Pb
print(f"Virtual X reserves: {round(X_v, round_digits)}")
print(f"Virtual Y reserves: {round(Y_v, round_digits)}")

# Calculate total reserves
X_total = X_r + X_v
Y_total = Y_r + Y_v
print(f"Total X reserves: {round(X_total, round_digits)}")
print(f"Total Y reserves: {round(Y_total, round_digits)}")

# Calculate the new K
K_total = X_total * Y_total
#print(f"Total K (with virtual reserves): {round(K_total, round_digits)}")


# Perform trade
take_from_lp = 'EUR'
amount_taken = 1  # from the liquidity pool

if take_from_lp == X_token:
    token_taken = X_token
    token_given = Y_token

    X_new_liq = X_r - amount_taken
    Y_new_liq = (K_total / (X_new_liq + X_v)) - Y_v
    amount_given = Y_new_liq - Y_r  # to the liquidity pool
else:
    token_taken = Y_token
    token_given = X_token

    Y_new_liq = Y_r - amount_taken
    X_new_liq = (K_total / (Y_new_liq + Y_v)) - X_v
    amount_given = X_new_liq - X_r  # to the liquidity pool

print(f'From LP it was taken {amount_taken} of {token_taken}')
print(f'The LP received {amount_given} of {token_given}')
print(f'Now LP {X_token}: {round(X_new_liq, round_digits)} and {Y_token}: {round(Y_new_liq, round_digits)}')
print(f'New L: {round(math.sqrt((X_new_liq + X_v) * (Y_new_liq + Y_v)), round_digits)}')
