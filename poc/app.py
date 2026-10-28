import streamlit as st

from cp_sat_intervals import (
    DISPLAY_DESTINATIONS,
    DISPLAY_SOURCES,
    solve_bounds,
    solve_solution,
)


st.set_page_config(page_title="Transition bounds", layout="wide")
st.title("Transition bounds")
st.caption("Amounts are vote counts. Each range sets a minimum and maximum for that transition.")


def slider_key(source, destination):
    return f"transition_{source}_{destination}"


def remember_slider_change(pair):
    source, destination = pair
    selected_bounds = tuple(st.session_state[slider_key(source, destination)])
    previous_bounds = st.session_state["slider_snapshots"][pair]
    base_bounds = st.session_state["base_bounds"][pair]
    manual_limits = dict(st.session_state.get("manual_limits", {}))

    for index, endpoint in enumerate(("min", "max")):
        if selected_bounds[index] == previous_bounds[index]:
            continue
        limit_key = (source, destination, endpoint)
        if selected_bounds[index] == base_bounds[index]:
            manual_limits.pop(limit_key, None)
        else:
            manual_limits[limit_key] = selected_bounds[index]

    st.session_state["manual_limits"] = manual_limits


def release_manual_limit(pair, endpoint):
    checkbox_key = f"manual_indicator_{pair[0]}_{pair[1]}_{endpoint}"
    if st.session_state[checkbox_key]:
        return

    manual_limits = dict(st.session_state["manual_limits"])
    manual_limits.pop((*pair, endpoint), None)
    st.session_state["manual_limits"] = manual_limits


def save_feasible_slider_values():
    values = {
        pair: tuple(st.session_state[slider_key(*pair)])
        for pair in pairs
    }
    st.session_state["last_feasible_slider_values"] = values
    st.session_state["slider_snapshots"] = dict(values)


pairs = [
    (source, destination)
    for destination in DISPLAY_DESTINATIONS
    for source in DISPLAY_SOURCES
]

if "base_bounds" not in st.session_state:
    with st.spinner("Calculating initial feasible ranges..."):
        initial_bounds = solve_bounds()
    if initial_bounds is None:
        st.error("The base model is infeasible.")
        st.stop()

    st.session_state["base_bounds"] = initial_bounds
    st.session_state["feasible_bounds"] = initial_bounds
    st.session_state["manual_limits"] = {}
    st.session_state["committed_manual_limits"] = {}
    for pair, bounds in initial_bounds.items():
        st.session_state[slider_key(*pair)] = bounds
    save_feasible_slider_values()

base_bounds = st.session_state["base_bounds"]
reset_clicked = st.button("Reset all slider constraints")

if reset_clicked:
    st.session_state["manual_limits"] = {}
    st.session_state["committed_manual_limits"] = {}
    st.session_state["feasible_bounds"] = base_bounds
    for pair, bounds in base_bounds.items():
        st.session_state[slider_key(*pair)] = bounds
    feasible_bounds = base_bounds
    save_feasible_slider_values()
    st.success("Slider constraints reset.")
else:
    manual_limits = st.session_state["manual_limits"]
    if manual_limits:
        with st.spinner("Updating feasible ranges..."):
            feasible_bounds = solve_bounds(manual_limits)
        if feasible_bounds is None:
            st.error("These slider constraints are infeasible. Adjust a range or reset the constraints.")
            st.session_state["manual_limits"] = st.session_state["committed_manual_limits"]
            for key, value in st.session_state["last_feasible_slider_values"].items():
                st.session_state[key] = value
            manual_limits = st.session_state["manual_limits"]
            feasible_bounds = st.session_state["feasible_bounds"]
        else:
            st.session_state["feasible_bounds"] = feasible_bounds
            for pair, bounds in feasible_bounds.items():
                slider_bounds = (
                    manual_limits.get((*pair, "min"), bounds[0]),
                    manual_limits.get((*pair, "max"), bounds[1]),
                )
                st.session_state[slider_key(*pair)] = slider_bounds
            st.session_state["committed_manual_limits"] = dict(manual_limits)
            save_feasible_slider_values()
    else:
        feasible_bounds = base_bounds
        st.session_state["feasible_bounds"] = base_bounds
        for pair, bounds in base_bounds.items():
            st.session_state[slider_key(*pair)] = bounds
        st.session_state["committed_manual_limits"] = {}
        save_feasible_slider_values()


tabs = st.tabs(
    [f"Destination {destination}" for destination in DISPLAY_DESTINATIONS],
    key="destination_tabs",
    on_change="rerun",
)
st.caption("Move either endpoint to constrain it. Disabled checkboxes show which endpoints are manually constrained.")
for destination, tab in zip(DISPLAY_DESTINATIONS, tabs):
    with tab:
        for source in DISPLAY_SOURCES:
            pair = (source, destination)
            domain_min, domain_max = base_bounds[pair]
            label = f"{source} to {destination}"
            minimum_key = f"manual_indicator_{source}_{destination}_min"
            maximum_key = f"manual_indicator_{source}_{destination}_max"
            minimum_is_manual = (*pair, "min") in st.session_state["manual_limits"]
            maximum_is_manual = (*pair, "max") in st.session_state["manual_limits"]
            st.session_state[minimum_key] = minimum_is_manual
            st.session_state[maximum_key] = maximum_is_manual

            minimum_column, slider_column, maximum_column = st.columns(
                [0.35, 6, 0.35], vertical_alignment="center"
            )
            with minimum_column:
                st.checkbox(
                    f"{label} minimum constrained",
                    key=minimum_key,
                    disabled=not minimum_is_manual,
                    label_visibility="collapsed",
                    on_change=release_manual_limit,
                    args=(pair, "min"),
                    help="Minimum endpoint is manually constrained."
                    if minimum_is_manual
                    else "Minimum endpoint is solver-controlled.",
                )
            with slider_column:
                st.slider(
                    label,
                    min_value=domain_min,
                    max_value=domain_max,
                    step=1,
                    key=slider_key(*pair),
                    on_change=remember_slider_change,
                    args=(pair,),
                    help="Only an endpoint you move becomes a manual constraint.",
                )
            with maximum_column:
                st.checkbox(
                    f"{label} maximum constrained",
                    key=maximum_key,
                    disabled=not maximum_is_manual,
                    label_visibility="collapsed",
                    on_change=release_manual_limit,
                    args=(pair, "max"),
                    help="Maximum endpoint is manually constrained."
                    if maximum_is_manual
                    else "Maximum endpoint is solver-controlled.",
                )

st.subheader("Feasible intervals")
header_columns = st.columns([1.2, *([2] * len(DISPLAY_SOURCES))])
header_columns[0].markdown("**Destination**")
for column, source in zip(header_columns[1:], DISPLAY_SOURCES):
    column.markdown(f"**{source}**")

for destination in DISPLAY_DESTINATIONS:
    columns = st.columns([1.2, *([2] * len(DISPLAY_SOURCES))])
    columns[0].write(destination)
    for column, source in zip(columns[1:], DISPLAY_SOURCES):
        lower, upper = feasible_bounds[source, destination]
        column.write(f"{lower:,} .. {upper:,}")

st.subheader("Solutions")
if st.button("Find solution"):
    with st.spinner("Finding an exact solution..."):
        solution = solve_solution(
            st.session_state["committed_manual_limits"],
            st.session_state.get("solutions", []),
        )
    if solution is None:
        st.info("No additional solution satisfies the current slider constraints.")
    else:
        st.session_state.setdefault("solutions", []).append(solution)

for solution_number, solution in enumerate(st.session_state.get("solutions", []), start=1):
    st.markdown(f"**Solution {solution_number}**")
    st.table(
        [
            {
                "Destination": destination,
                **{
                    source: f"{solution[source, destination]:,}"
                    for source in DISPLAY_SOURCES
                },
            }
            for destination in DISPLAY_DESTINATIONS
        ]
    )
