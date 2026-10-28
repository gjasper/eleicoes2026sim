from pathlib import Path

from ortools.sat.python import cp_model


SOURCE_SUMMARIES = {
    "O": ("EAC", "RS", "RC", "Z", "S", "HD", "CB", "EC", "VWG", "RCP"),
    "BN": ("B", "N"),
}
DESTINATION_SUMMARIES = {"BN": ("B", "N")}
DISPLAY_SOURCES = ("O", "FB", "L", "BN", "A")
DISPLAY_DESTINATIONS = ("FB", "L", "BN", "A")
SCENARIO_3_EXACT_FLOWS_TO_L = {
    "O": 4_000_000,
    "FB": 1_000_000,
    "BN": 3_000_000,
    "A": 3_000_000,
}


def read_counts():
    counts = {}
    data_path = Path(__file__).with_name("data")
    for line_number, line in enumerate(data_path.read_text().splitlines(), start=1):
        if not line.strip():
            continue
        name, value = line.split()
        if not name.startswith(("1_", "2_")):
            raise ValueError(f"Unexpected entry on line {line_number}: {name}")
        counts[name] = int(value)

    sources = {name[2:]: value for name, value in counts.items() if name.startswith("1_")}
    destinations = {name[2:]: value for name, value in counts.items() if name.startswith("2_")}
    if not sources or not destinations:
        raise ValueError("Data must contain both 1_ source entries and 2_ destination entries.")
    return sources, destinations


def build_model(sources, destinations):
    missing_sources = {
        component
        for components in SOURCE_SUMMARIES.values()
        for component in components
        if component not in sources
    }
    if missing_sources:
        raise ValueError(f"Missing summary source counts: {', '.join(sorted(missing_sources))}")
    missing_destinations = {
        component
        for components in DESTINATION_SUMMARIES.values()
        for component in components
        if component not in destinations
    }
    if missing_destinations:
        raise ValueError(
            f"Missing summary destination counts: {', '.join(sorted(missing_destinations))}"
        )

    model = cp_model.CpModel()
    source_vars = {
        name: model.NewIntVar(value, value, f"1_{name}")
        for name, value in sources.items()
    }
    source_totals = dict(sources)
    source_components = set()
    for summary, components in SOURCE_SUMMARIES.items():
        summary_total = sum(sources[name] for name in components)
        source_totals[summary] = summary_total
        source_vars[summary] = model.NewIntVar(
            summary_total, summary_total, f"1_{summary}"
        )
        model.Add(source_vars[summary] == sum(source_vars[name] for name in components))
        source_components.update(components)

    flow_sources = {
        name: variable
        for name, variable in source_vars.items()
        if name not in source_components
    }
    destination_vars = {
        name: model.NewIntVar(value, value, f"2_{name}")
        for name, value in destinations.items()
    }
    destination_totals = dict(destinations)
    destination_components = set()
    for summary, components in DESTINATION_SUMMARIES.items():
        summary_total = sum(destinations[name] for name in components)
        destination_totals[summary] = summary_total
        destination_vars[summary] = model.NewIntVar(
            summary_total, summary_total, f"2_{summary}"
        )
        model.Add(
            destination_vars[summary]
            == sum(destination_vars[name] for name in components)
        )
        destination_components.update(components)

    flow_destinations = {
        name: variable
        for name, variable in destination_vars.items()
        if name not in destination_components
    }
    transitions = {
        (source, destination): model.NewIntVar(
            0,
            min(source_totals[source], destination_totals[destination]),
            f"TRANS_FROM_1_{source}_TO_2_{destination}",
        )
        for source in flow_sources
        for destination in flow_destinations
    }

    model.Add(sum(flow_sources.values()) == sum(flow_destinations.values()))

    for source, source_var in flow_sources.items():
        model.Add(
            sum(transitions[source, destination] for destination in flow_destinations)
            == source_var
        )
    for destination, destination_var in flow_destinations.items():
        model.Add(
            sum(transitions[source, destination] for source in flow_sources)
            == destination_var
        )

    return model, transitions, source_totals


def add_scenario_1_constraints(model, transitions, destinations):
    for candidate in ("FB", "L", "A"):
        minimum_from_counterpart = (4 * destinations[candidate]) // 5
        model.Add(transitions[candidate, candidate] >= minimum_from_counterpart)


def add_scenario_2_constraints(model, transitions, source_totals):
    for (source, _), variable in transitions.items():
        model.Add(100 * variable >= source_totals[source])


def add_scenario_3_constraints(model, transitions):
    for source, amount in SCENARIO_3_EXACT_FLOWS_TO_L.items():
        model.Add(transitions[source, "L"] == amount)


def find_bound(model, solver, variable, maximize):
    if maximize:
        model.Maximize(variable)
    else:
        model.Minimize(variable)

    status = solver.Solve(model)
    if status != cp_model.OPTIMAL:
        raise RuntimeError(f"Could not determine an exact bound for {variable.Name()}.")
    return solver.Value(variable)


def solve_bounds(manual_limits=None):
    sources, destinations = read_counts()
    model, transitions, source_totals = build_model(sources, destinations)

    # Optional scenarios are retained here but disabled for interactive sliders.
    # add_scenario_1_constraints(model, transitions, destinations)
    # add_scenario_2_constraints(model, transitions, source_totals)
    # add_scenario_3_constraints(model, transitions)

    for (source, destination, endpoint), value in (manual_limits or {}).items():
        variable = transitions[source, destination]
        if endpoint == "min":
            model.Add(variable >= value)
        elif endpoint == "max":
            model.Add(variable <= value)
        else:
            raise ValueError(f"Unknown transition endpoint: {endpoint}")

    solver = cp_model.CpSolver()
    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return None

    bounds = {}
    for key, variable in transitions.items():
        lower = find_bound(model, solver, variable, maximize=False)
        upper = find_bound(model, solver, variable, maximize=True)
        bounds[key] = (lower, upper)
    return bounds


def solve_solution(manual_limits=None, excluded_solutions=None):
    sources, destinations = read_counts()
    model, transitions, _ = build_model(sources, destinations)

    for (source, destination, endpoint), value in (manual_limits or {}).items():
        variable = transitions[source, destination]
        if endpoint == "min":
            model.Add(variable >= value)
        elif endpoint == "max":
            model.Add(variable <= value)
        else:
            raise ValueError(f"Unknown transition endpoint: {endpoint}")

    for solution in excluded_solutions or []:
        model.AddForbiddenAssignments(
            list(transitions.values()),
            [[solution[key] for key in transitions]],
        )

    solver = cp_model.CpSolver()
    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return None
    return {key: solver.Value(variable) for key, variable in transitions.items()}


def main():
    bounds = solve_bounds()
    if bounds is None:
        raise RuntimeError("The base transition model is infeasible.")

    headers = ["Destination", *DISPLAY_SOURCES]
    rows = []
    for destination in DISPLAY_DESTINATIONS:
        row = [destination]
        for source in DISPLAY_SOURCES:
            lower, upper = bounds[source, destination]
            row.append(f"{{{lower}..{upper}}}")
        rows.append(row)

    widths = [
        max(len(header), *(len(row[index]) for row in rows))
        for index, header in enumerate(headers)
    ]
    print(" | ".join(header.ljust(widths[index]) for index, header in enumerate(headers)))
    print("-+-".join("-" * width for width in widths))
    for row in rows:
        cells = [row[0].ljust(widths[0])]
        cells.extend(row[index].rjust(widths[index]) for index in range(1, len(row)))
        print(" | ".join(cells))


if __name__ == "__main__":
    main()