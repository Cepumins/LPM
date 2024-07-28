import math
import sympy as sp
import time


total_start = time.time()

X_token = 'TSLA'
Y_token = 'USD'
round_digits = 2
x_r = 10 # Oil


P = 176.40 # ETH/USDC
print(f'{X_token} costs {P} of {Y_token}')

y_r = x_r * P

price_range = 1.2

Pa = 13.63 # 1 / price_range * P # lower
#Pb = 800 # price_range * P # upper
Pb = P * (P / Pa)
print(f'P: {round(P, round_digits)} and Range: [{round(Pa, round_digits)}; {round(Pb, round_digits)}]')

Pa_sq = sp.sqrt(Pa)
Pb_sq = sp.sqrt(Pb)

def calculate_L(X_r, Y_r, Pa_sq, Pb_sq):
    # Define the symbols
    L = sp.symbols('L')

    # Define the equation
    equation = (X_r + L / Pb_sq) * (Y_r + L * Pa_sq) - L**2

    # Solve for L
    solutions = sp.solve(equation, L)
    
    # Filter out the negative solutions
    positive_solutions = [sol for sol in solutions if sol.is_real and sol > 0]

    if not positive_solutions:
        raise ValueError("No positive solutions found for L.")

    L_solution = max(positive_solutions)  # Choose the largest positive solution

    # Evaluate the solution
    L_value = L_solution.evalf()
    return L_value

'''
start_time = time.time()
L_o = calculate_L(x_r, y_r, Pa_sq, Pb_sq)
print(f"L_o: {round(L_o, 2)}")
print(f'Time to find L_o: {round(time.time() - start_time, round_digits)}')
'''



def calculate_L_formula(X_r, Y_r, Pa_sq, Pb_sq):
    # Calculate square roots of prices
    #A = sp.sqrt(P_b)
    Pa = Pa_sq**2
    Pb = Pb_sq**2
    #B = sp.sqrt(P_a)

    part1 = Pa * Pb * X_r**2 - 2 * Pa_sq * Pb_sq * X_r * Y_r + 4 * Pb * X_r * Y_r + Y_r**2
    part2 = Pa_sq * Pb_sq * X_r + Y_r

    numerator = sp.sqrt(part1) + part2
    denominator = 2 * Pa_sq - 2 * Pb_sq
    
    # Calculate L
    L = - numerator / denominator
    
    # Evaluate the solution
    #L_value = L.evalf()
    return L.evalf()

start_time = time.time()
L = calculate_L_formula(x_r, y_r, Pa_sq, Pb_sq)
L_start = L
print(f"L: {round(L, round_digits)}")
print(f'Time to find L: {round(time.time() - start_time, round_digits)}')

print(f'Real {X_token} (x): {x_r}')
print(f'Real {Y_token} (y): {y_r}')

x_virtual = L / Pb_sq
y_virtual = L * Pa_sq

print(f'Virtual {X_token} (x): {round(x_virtual, round_digits)}')
print(f'Virtual {Y_token} (y): {round(y_virtual, round_digits)}')

x_total = x_r + x_virtual
y_total = y_r + y_virtual

print(f'Total {X_token} (x): {round(x_total, round_digits)}')
print(f'Total {Y_token} (y): {round(y_total, round_digits)}')
k_total = x_total * y_total
print(f'L**2 = {round(L**2, round_digits)} and K = {round(k_total, round_digits)}')
p_total = y_total / x_total
print(f'P in total: {round(p_total, round_digits)}')
y_to_mimic = L * sp.sqrt(P)
x_to_mimic = L**2 / y_to_mimic
print(f'With CPMM needed {round(x_to_mimic, round_digits)} of {X_token} and {round(y_to_mimic, round_digits)} of {Y_token}')


# Perform trade
take_from_lp = 'TSLA'
amount_taken = 1  # from the liquidity pool

if take_from_lp == X_token:
    token_taken = X_token
    token_given = Y_token

    x_new_real = x_r - amount_taken
    y_new_real = (k_total / (x_new_real + x_virtual)) - y_virtual
    amount_given = y_new_real - y_r  # to the liquidity pool
else:
    token_taken = Y_token
    token_given = X_token

    y_new_real = y_r - amount_taken
    x_new_real = (k_total / (y_new_real + y_virtual)) - x_virtual
    amount_given = x_new_real - x_r  # to the liquidity pool

print(f'From LP it was taken {round(amount_taken, round_digits)} of {token_taken}')
print(f'The LP received {round(amount_given, round_digits)} of {token_given}')
print(f'Now LP {X_token}: {round(x_new_real, round_digits)} and {Y_token}: {round(y_new_real, round_digits)}')
print(f'New L: {round(math.sqrt((x_new_real + x_virtual) * (y_new_real + y_virtual)), round_digits)}')
L = calculate_L_formula(x_new_real, y_new_real, Pa_sq, Pb_sq)
print(f"New L from new: {round(L, round_digits)}")
k_total = round((x_new_real + x_virtual) * (y_new_real + y_virtual), round_digits)
print(f'L**2 = {round(L**2, round_digits)} and K = {round(k_total, round_digits)}')
print(f'Total time: {round(time.time() - total_start, round_digits)}')
p_real = round(y_new_real / x_new_real, round_digits)
p_new_total = round((y_new_real + y_virtual) / (x_new_real + x_virtual), round_digits)
print(f'P new real: {p_real} and P new total: {p_new_total}')

print(f'{X_token},10,{round(P*10, round_digits)},{round(L_start, round_digits)},{round(Pa, round_digits)},{round(Pb, round_digits)}')