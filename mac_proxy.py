import socket
import threading
import sys

# CONFIGURATION
LOCAL_BIND_HOST = '0.0.0.0'
LOCAL_PORT = 8888
REMOTE_HOST = '127.0.0.1'  # Connect to your local SSH tunnel
REMOTE_PORT = 9005

def handle_client(client_socket):
    try:
        remote_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        remote_socket.connect((REMOTE_HOST, REMOTE_PORT))
    except Exception as e:
        print(f"[!] Could not connect to {REMOTE_HOST}:{REMOTE_PORT} - {e}")
        client_socket.close()
        return

    def forward(src, dst, name):
        try:
            while True:
                data = src.recv(4096)
                if not data:
                    break
                dst.sendall(data)
        except Exception:
            pass
        finally:
            try: dst.shutdown(socket.SHUT_RDWR)
            except: pass
            dst.close()
            # print(f"[-] Connection closed ({name})")

    t1 = threading.Thread(target=forward, args=(client_socket, remote_socket, "Client->Remote"))
    t2 = threading.Thread(target=forward, args=(remote_socket, client_socket, "Remote->Client"))
    t1.daemon = True
    t2.daemon = True
    t1.start()
    t2.start()

def start_server():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        server.bind((LOCAL_BIND_HOST, LOCAL_PORT))
    except Exception as e:
        print(f"[!] Failed to bind to {LOCAL_BIND_HOST}:{LOCAL_PORT} - {e}")
        sys.exit(1)

    server.listen(5)
    print(f"[*] Proxy hearing on {LOCAL_BIND_HOST}:{LOCAL_PORT} ==> {REMOTE_HOST}:{REMOTE_PORT}")
    print(f"[*] Use http://<YOUR_MAC_IP>:{LOCAL_PORT}/xr_poc.html")

    while True:
        client_sock, addr = server.accept()
        print(f"[+] Connection from {addr[0]}:{addr[1]}")
        client_handler = threading.Thread(target=handle_client, args=(client_sock,))
        client_handler.daemon = True
        client_handler.start()

if __name__ == '__main__':
    start_server()
