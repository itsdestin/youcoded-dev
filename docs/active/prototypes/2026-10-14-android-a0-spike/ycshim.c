// Spike shim for running musl programs inside an Android app sandbox.
// WHY 1: Android's app seccomp filter kills any process calling io_uring_setup (SIGSYS);
//        libuv (Node) probes it at loop start. Answer ENOSYS so libuv falls back to epoll.
// WHY 2: an app may not execve() files in its own data folder, and Android has no
//        /usr/bin/env or /bin/sh. A "#!" script is run by exec'ing its interpreter instead.
#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <stdarg.h>
#include <stdlib.h>
#include <string.h>
#include <sys/syscall.h>
#include <unistd.h>

long syscall(long n, ...) {
  va_list ap; va_start(ap, n);
  long a[6]; for (int i = 0; i < 6; i++) a[i] = va_arg(ap, long);
  va_end(ap);
  if (n == SYS_io_uring_setup) { errno = ENOSYS; return -1; }
  static long (*real)(long, ...);
  if (!real) real = (long (*)(long, ...))dlsym(RTLD_NEXT, "syscall");
  return real(n, a[0], a[1], a[2], a[3], a[4], a[5]);
}

static int find_in_path(const char *name, char *out, size_t len) {
  const char *p = getenv("PATH"); if (!p) return -1;
  while (*p) {
    const char *e = strchr(p, ':'); size_t l = e ? (size_t)(e - p) : strlen(p);
    if (l + strlen(name) + 2 < len) {
      memcpy(out, p, l); out[l] = '/'; strcpy(out + l + 1, name);
      if (access(out, X_OK) == 0) return 0;
    }
    if (!e) break; p = e + 1;
  }
  return -1;
}

extern char **environ;
int execve(const char *path, char *const argv[], char *const envp[]) {
  static int (*real)(const char *, char *const[], char *const[]);
  if (!real) real = dlsym(RTLD_NEXT, "execve");
  char buf[256]; int fd = open(path, O_RDONLY | O_CLOEXEC);
  if (fd >= 0) {
    ssize_t n = read(fd, buf, sizeof buf - 1); close(fd);
    if (n > 2 && buf[0] == '#' && buf[1] == '!') {
      buf[n] = 0; char *nl = strchr(buf, '\n'); if (nl) *nl = 0;
      char *interp = buf + 2; while (*interp == ' ') interp++;
      char *arg = strchr(interp, ' '); if (arg) { *arg++ = 0; while (*arg == ' ') arg++; if (!*arg) arg = NULL; }
      char resolved[512];
      const char *base = strrchr(interp, '/'); base = base ? base + 1 : interp;
      // "/usr/bin/env X": X is the real interpreter, looked up in PATH.
      if (!strcmp(base, "env") && arg) { char *sp = strchr(arg, ' '); if (sp) *sp = 0; base = arg; arg = NULL; }
      if (access(interp, X_OK) != 0 || !strcmp(strrchr(interp,'/')?strrchr(interp,'/')+1:interp, "env")) {
        if (find_in_path(base, resolved, sizeof resolved) != 0) { errno = ENOENT; return -1; }
        interp = resolved;
      }
      int argc = 0; while (argv[argc]) argc++;
      char **nargv = calloc(argc + 4, sizeof(char *)); int k = 0;
      nargv[k++] = interp; if (arg) nargv[k++] = arg; nargv[k++] = (char *)path;
      for (int i = 1; i < argc; i++) nargv[k++] = argv[i];
      return real(interp, nargv, envp);
    }
  }
  return real(path, argv, envp);
}

// WHY: musl's execvp/execv call its internal execve, which an interposed execve never sees;
// libuv (Node's child_process) uses execvp. Route the PATH-searching forms through ours.
int execvpe(const char *file, char *const argv[], char *const envp[]) {
  if (strchr(file, '/')) return execve(file, argv, envp);
  char full[512];
  if (find_in_path(file, full, sizeof full) != 0) { errno = ENOENT; return -1; }
  return execve(full, argv, envp);
}
int execvp(const char *file, char *const argv[]) { return execvpe(file, argv, environ); }
int execv(const char *path, char *const argv[]) { return execve(path, argv, environ); }
