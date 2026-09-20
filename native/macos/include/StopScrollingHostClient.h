#pragma once

#ifdef __cplusplus
extern "C" {
#endif

int ss_host_request(const char *operation, const char *body, char **result, char **error);
int ss_host_activate(char **result, char **error);
int ss_host_setup(char **result, char **error);
void ss_host_close(void);
void ss_host_free(char *pointer);

#ifdef __cplusplus
}
#endif
