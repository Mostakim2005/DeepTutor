"""Install STEM and Electrical Engineering domain skills into DeepTutor."""

import os
from pathlib import Path
from deeptutor.services.skill.service import get_skill_service, SkillExistsError

service = get_skill_service()

STEM_SKILLS = [
    {
        "name": "spice-circuit-analyzer",
        "description": "Formulate, solve, and verify circuit netlists using nodal and mesh analysis, Thevenin/Norton equivalents, and transient/AC analysis.",
        "tags": ["stem", "electrical-engineering", "circuits"],
        "content": """# SPICE Circuit Analyzer

## Overview
Guides the formulation, solving, and formal verification of analog electrical circuits from high school physics up through 1st-year Electrical Engineering (Linear Circuit Analysis).

## When to Use
- Analyzing DC or AC circuits with resistors, capacitors, inductors, diodes, and operational amplifiers.
- Determining node voltages, branch currents, or mesh currents.
- Deriving Thevenin and Norton equivalent circuits.
- Solving RLC transient responses (homogeneous + particular solutions).
- Generating SPICE netlists for simulation.

## Methodology
1. **Circuit Topological Definition**:
   - Number all essential nodes; assign Node 0 as the reference ground.
   - Assign reference current arrow directions across every branch.
2. **System Formulation**:
   - Apply Kirchhoff's Current Law (KCL) at all non-reference nodes.
   - For floating voltage sources, form a supernode.
   - For mesh analysis, apply Kirchhoff's Voltage Law (KVL) around independent loops (forming supermeshes around current sources).
3. **Analytical Matrix Solution**:
   - Formulate the Conductance matrix $[G][V] = [I]$.
   - Solve for exact symbolic node voltages.
4. **Validation**:
   - Verify power conservation ($\sum P_{\\text{supplied}} = \sum P_{\\text{absorbed}}$).
   - Check dimensional consistency and asymptotic limits ($t \\to 0^+$ and $t \\to \\infty$).
"""
    },
    {
        "name": "phasor-ac-circuit-solver",
        "description": "Solve steady-state AC circuits, complex impedance transformations, reactive power factor correction, and resonance.",
        "tags": ["stem", "electrical-engineering", "ac-circuits"],
        "content": """# AC Phasor & Sinusoidal Circuit Solver

## Overview
Solves single-phase sinusoidal steady-state AC circuits using complex phasor notation for A-Level physics and 1st-year university electrical engineering.

## When to Use
- Transforming time-domain signals $v(t) = V_m \\cos(\\omega t + \\phi)$ into frequency-domain phasors $\\mathbf{V} = V_{\\text{rms}} \\angle \\phi$.
- Calculating complex impedances: $Z_R = R$, $Z_L = j\\omega L$, $Z_C = \\frac{1}{j\\omega C} = -j\\frac{1}{\\omega C}$.
- Solving series and parallel RLC resonance circuits ($Q$-factor, bandwidth $\\mathcal{B}$, resonant frequency $\\omega_0 = 1/\\sqrt{LC}$).
- Calculating Complex Power: $\\mathbf{S} = P + jQ = \\mathbf{V}_{\\text{rms}} \\mathbf{I}_{\\text{rms}}^*$.
- Sizing capacitors for power factor correction ($\text{pf} \\to 1.0$).

## Methodology
1. **Transform to Frequency Domain**: Convert all sources to RMS or peak cosine phasors.
2. **Impedance Network Reduction**: Compute equivalent impedance $Z_{\\text{eq}}$ in polar and rectangular coordinates.
3. **Ohm's Law with Phasors**: Solve $\\mathbf{I} = \\frac{\\mathbf{V}}{Z_{\\text{eq}}}$.
4. **Power Flow Analysis**:
   - Active Power: $P = |\\mathbf{V}||\\mathbf{I}| \\cos(\\theta_v - \\theta_i)$ (Watts).
   - Reactive Power: $Q = |\\mathbf{V}||\\mathbf{I}| \\sin(\\theta_v - \\theta_i)$ (VAR).
   - Power Factor: $\\text{pf} = \\cos(\\theta_v - \\theta_i)$.
"""
    },
    {
        "name": "bode-plot-frequency-response",
        "description": "Analyze transfer functions, find poles and zeros, calculate bandwidth, cutoff frequency, and evaluate gain and phase stability margins.",
        "tags": ["stem", "electrical-engineering", "signals-systems"],
        "content": """# Bode Plot & Transfer Function Analyzer

## Overview
Deconstructs continuous-time transfer functions $H(s)$ into asymptotic magnitude (dB) and phase (degrees) frequency response curves for analog filters and control systems.

## When to Use
- Given an analog filter or circuit transfer function $H(s) = \\frac{N(s)}{D(s)}$.
- Finding poles ($D(s)=0$) and zeros ($N(s)=0$).
- Constructing asymptotic Bode magnitude and phase plots.
- Evaluating low-pass, high-pass, band-pass, and notch filter topologies.
- Determining $-3\\text{ dB}$ cutoff frequencies, roll-off slopes ($\\pm 20\\text{ dB/decade}$ per pole/zero), Gain Margin, and Phase Margin.

## Methodology
1. **Standard Time-Constant Form**: Factor $H(s)$ into $K \\cdot \\frac{\\prod (1 + s/z_i)}{\\prod (1 + s/p_j)}$.
2. **Substitute $s = j\\omega$**:
   - Break into four canonical building blocks: constant gain $K_0$, poles/zeros at origin $(j\\omega)^{\\pm 1}$, real poles/zeros $(1 + j\\omega/\\omega_c)^{\\pm 1}$, and complex conjugate pairs.
3. **Magnitude Breakdown**:
   - Express magnitude in decibels: $|H(j\\omega)|_{\\text{dB}} = 20 \\log_{10} |H(j\\omega)|$.
   - Sum slopes across corner frequencies.
4. **Phase Breakdown**:
   - Phase $\\angle H(j\\omega) = \\sum \\angle \\text{zeros} - \\sum \\angle \\text{poles}$.
   - Each zero contributes $+90^\\circ$ over two decades; each pole contributes $-90^\\circ$.
"""
    },
    {
        "name": "digital-logic-minimizer",
        "description": "Simplify Boolean algebra expressions using Karnaugh maps and Quine-McCluskey, design truth tables, and synthesize combinational logic.",
        "tags": ["stem", "electrical-engineering", "digital-logic"],
        "content": """# Digital Logic & Boolean Minimizer

## Overview
Specialized skill for simplifying Boolean logic functions, designing optimal combinational logic, and constructing finite state machines for introductory digital electronics.

## When to Use
- Minimizing Boolean expressions into Sum of Products (SOP) or Product of Sums (POS).
- Constructing and grouping 2, 3, or 4-variable Karnaugh Maps (K-maps) including don't-care conditions ($d$).
- Designing truth tables for multiplexers, decoders, full adders, and parity generators.
- Converting logic equations into universal NAND-only or NOR-only implementations.
- Analyzing flip-flops (D, JK, T) and sequential state transitions.

## Methodology
1. **Truth Table Construction**: Tabulate all $2^n$ binary input combinations and target outputs.
2. **K-Map Plotting**:
   - Arrange rows and columns using Gray code order (00, 01, 11, 10).
   - Group 1s in rectangular blocks of powers of two ($1, 2, 4, 8, 16$) wrapping around borders.
   - Utilize Don't-Care ($X$) states to maximize group size and eliminate literal dependencies.
3. **Essential Prime Implicants**: Extract non-redundant minimal Boolean terms.
4. **Gate-Level Synthesis**: Provide ASCII or schematic gate representations with propagation delay considerations.
"""
    },
    {
        "name": "symbolic-math-solver",
        "description": "Perform exact analytical derivations for calculus, linear algebra, Laplace/Fourier transforms, and differential equations via SymPy.",
        "tags": ["stem", "mathematics", "calculus"],
        "content": """# Symbolic Math Solver

## Overview
Carries out rigorous, step-by-step symbolic mathematics for Cambridge A-Level Further Mathematics and 1st-year Engineering Mathematics.

## When to Use
- Single-variable and multivariable calculus (limits, implicit differentiation, integration by parts, partial fractions).
- Ordinary differential equations (1st order linear, separation of variables, 2nd order with constant coefficients).
- Linear algebra (determinants, matrix inverses, Gaussian elimination, eigenvalues, eigenvectors).
- Integral transforms (Laplace transforms $\\mathcal{L}\\{f(t)\\}$, inverse Laplace, Fourier series expansions).

## Methodology
1. **Mathematical Scaffolding**: Clearly define the domain, independent variables, and given boundary/initial conditions.
2. **Step-by-Step Derivation**:
   - Write out intermediate transformation steps in clean KaTeX/LaTeX.
   - Never skip algebraic justifications (e.g. substitutions, integration factors).
3. **Exact Analytical Values**: Express solutions in closed-form radicals, fractions, and symbolic constants ($\\pi, e, \\sqrt{2}$) rather than truncated decimals.
4. **Verification**: Differentiate back to check integral answers; substitute candidate solutions back into the original ODE.
"""
    },
    {
        "name": "unit-converter-dimensional-analysis",
        "description": "Perform Buckingham Pi dimensional analysis and verify SI unit conversions across electromagnetic, thermal, and mechanical domains.",
        "tags": ["stem", "physics", "units"],
        "content": """# Dimensional Analysis & Unit Verification

## Overview
Ensures physical consistency across complex equations and translates between SI base units, derived units, and imperial units for physics and engineering students.

## When to Use
- Verifying the dimensional homogeneity of physical and electrical equations.
- Applying the Buckingham $\\Pi$ theorem in fluid mechanics and electromagnetics.
- Deconstructing derived electrical units into SI base units ($kg, m, s, A$).
- Converting between micro/nano/pico scale quantities without magnitude errors.

## Base Unit Reference
- Volt ($V$): $kg \\cdot m^2 \\cdot s^{-3} \\cdot A^{-1}$
- Ohm ($\\Omega$): $kg \\cdot m^2 \\cdot s^{-3} \\cdot A^{-2}$
- Farad ($F$): $kg^{-1} \\cdot m^{-2} \\cdot s^4 \\cdot A^2$
- Henry ($H$): $kg \\cdot m^2 \\cdot s^{-2} \\cdot A^{-2}$
- Tesla ($T$): $kg \\cdot s^{-2} \\cdot A^{-1}$
- Weber ($Wb$): $kg \\cdot m^2 \\cdot s^{-2} \\cdot A^{-1}$

## Methodology
1. **Deconstruct Parameters**: Map every variable to base dimensions $[M]^a [L]^b [T]^c [I]^d$.
2. **Balance Equalities**: Confirm LHS dimensions equal RHS dimensions.
3. **Catch Common Pitfalls**: Watch for rad/s vs Hz ($2\\pi$ factor), RMS vs peak amplitude ($\\sqrt{2}$ factor), and prefix power mistakes ($10^{-6}$ vs $10^{-9}$).
"""
    },
    {
        "name": "chemistry-redox-thermo-solver",
        "description": "Balance redox half-reactions, compute Gibbs free energy, cell potentials via the Nernst equation, and reaction kinetics.",
        "tags": ["stem", "chemistry", "thermodynamics"],
        "content": """# Chemical Equilibrium & Thermodynamics Solver

## Overview
Comprehensive tool for physical and inorganic chemistry across A-Level and 1st-year university chemistry courses.

## When to Use
- Balancing complicated redox reactions in acidic or basic aqueous solutions.
- Calculating reaction enthalpy $\\Delta H^\circ$, entropy $\\Delta S^\circ$, and Gibbs free energy $\\Delta G^\circ = \\Delta H^\circ - T\\Delta S^\circ$.
- Electrochemistry: calculating standard cell EMF $E^\\circ_{\\text{cell}} = E^\\circ_{\\text{cathode}} - E^\\circ_{\\text{anode}}$ and non-standard potentials via the Nernst Equation ($E = E^\circ - \\frac{RT}{nF} \\ln Q$).
- Chemical kinetics: rate laws, half-life formulas, and Arrhenius activation energy ($k = A e^{-E_a/RT}$).

## Methodology
1. **Redox Balancing (Ion-Electron Method)**:
   - Identify oxidation states; split into oxidation and reduction half-reactions.
   - Balance atoms other than O and H.
   - Balance O by adding $H_2O$; balance H by adding $H^+$ (or neutralize with $OH^-$ in basic medium).
   - Balance charge by adding electrons ($e^-$); multiply half-reactions to equalize electrons and sum.
2. **Thermodynamic Spontaneity**:
   - Check $\\Delta G^\circ < 0$ and $E^\\circ > 0$ for spontaneous forward reactions.
   - Relate to equilibrium constant: $\\Delta G^\circ = -RT \\ln K$.
"""
    },
    {
        "name": "exam-formula-matrix",
        "description": "Generate compact 1-page formula reference matrices for Cambridge A-Level, Oxford, and 1st-year engineering exams with physical constraints and pitfalls.",
        "tags": ["stem", "exam-prep", "cheat-sheet"],
        "content": """# High-Yield Exam Formula Matrix

## Overview
Synthesizes sprawling chapters and lecture slides into tightly organized 1-page cheat sheets and formula matrices for exam preparation.

## When to Use
- Preparing for Cambridge/Oxford A-Level or University midterms and finals.
- Reviewing before practice exams.
- Isolating the specific boundary conditions and assumptions behind every formula.

## Matrix Structure
Every synthesized topic produces a structured markdown table with 5 mandatory columns:
1. **Equation / Law**: Written in clean KaTeX.
2. **Variable Definitions & Units**: All variables with their expected SI units.
3. **Mandatory Assumptions**: Where the equation holds (e.g., "linear time-invariant only", "ideal gas only", "non-relativistic", "sinusoidal steady-state only").
4. **Common Exam Pitfalls**: Traps examiners set (e.g., sign conventions, radians vs degrees, passive sign convention for power).
5. **Typical Exam Question Archetype**: The exact type of problem that requires this equation.
"""
    }
]

for skill in STEM_SKILLS:
    name = skill["name"]
    try:
        service.create(
            name=name,
            description=skill["description"],
            content=skill["content"],
            tags=skill["tags"]
        )
        print(f"[CREATED] {name}")
    except SkillExistsError:
        service.update(
            name=name,
            description=skill["description"],
            content=skill["content"],
            tags=skill["tags"]
        )
        print(f"[UPDATED] {name}")
    except Exception as e:
        print(f"[ERROR] {name}: {e}")

print("All STEM & EE skills processed successfully!")
