# a fact is exactly three strings, so no line holds a route. a traceroute is a
# document: the whole route is one value, and the hops found inside it are
# separate facts about it.
add route produced
add ip hops
# both routes pass through 10.2.0.1, so asking for the next host answers from
# whichever line says so, including the other route's. the route is sitting in
# the row, so the row shows you: 203.0.113.5 is not in the first route's text.
add host next
