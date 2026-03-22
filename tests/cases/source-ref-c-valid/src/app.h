#ifndef APP_H
#define APP_H

struct Greeter {
    char *prefix;
};

enum Color { RED, GREEN, BLUE };

typedef int ErrorCode;

#define MAX_SIZE 100
#define CLAMP(x, lo, hi) ((x) < (lo) ? (lo) : (x) > (hi) ? (hi) : (x))

void greet(const char *name);

#endif
